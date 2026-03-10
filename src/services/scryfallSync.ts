import axios from "axios";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import streamJson from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray.js";
import { prisma } from "../db.js";
import { invalidateCardPoolCache } from "../repositories/cardRepo.js";

type ScryfallBulkEntry = {
  type: string;
  download_uri: string;
};

type ScryfallCard = {
  id: string;
  object: string;
  name: string;
  set: string;
  set_name?: string;
  collector_number: string;
  released_at?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  rarity?: string;
  prices?: { usd?: string | null; usd_foil?: string | null };
  lang?: string;
  colors?: string[];
  color_identity?: string[];
  games?: string[];
  legalities?: { commander?: string };
  image_uris?: { small?: string; normal?: string; large?: string; png?: string };
  card_faces?: Array<{
    image_uris?: { small?: string; normal?: string; large?: string; png?: string };
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
  }>;
};

const MANA_COLOR_SYMBOLS = new Set(["W", "U", "B", "R", "G"]);

/** Extract color symbols from a mana cost string like "{2}{W}{U}{B/R}". */
export function extractColorsFromManaCost(manaCost: string | null | undefined): string[] {
  if (!manaCost) return [];
  const symbols = new Set<string>();
  // Match each {…} token and pull out any WUBRG letters inside.
  for (const match of manaCost.matchAll(/\{([^}]+)\}/g)) {
    for (const ch of match[1].toUpperCase()) {
      if (MANA_COLOR_SYMBOLS.has(ch)) {
        symbols.add(ch);
      }
    }
  }
  // Return in WUBRG order.
  return ["W", "U", "B", "R", "G"].filter((s) => symbols.has(s));
}

const TMP_DIR = path.resolve(process.cwd(), ".tmp");
const BULK_PATH = path.join(TMP_DIR, "scryfall-default-cards.json");

export function getImageUris(card: ScryfallCard) {
  if (card.image_uris) {
    return card.image_uris;
  }
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris;
  }
  return {};
}

export function isBasicLand(card: ScryfallCard) {
  return (card.type_line ?? card.card_faces?.[0]?.type_line ?? "").includes("Basic Land");
}

export function shouldKeepCard(card: ScryfallCard) {
  if (card.object !== "card") {
    return false;
  }
  if (!(card.games ?? []).includes("paper")) {
    return false;
  }
  if (isBasicLand(card)) {
    return false;
  }
  if (card.lang !== "en") {
    return false;
  }
  if (card.legalities?.commander !== "legal") {
    return false;
  }
  return true;
}

async function getDefaultCardsDownloadUri() {
  const response = await axios.get<{ data: ScryfallBulkEntry[] }>("https://api.scryfall.com/bulk-data");
  const bulk = response.data.data.find((entry) => entry.type === "default_cards");
  if (!bulk?.download_uri) {
    throw new Error("Could not locate default_cards bulk feed.");
  }
  return bulk.download_uri;
}

async function downloadBulkJson(downloadUri: string) {
  await mkdir(TMP_DIR, { recursive: true });
  const response = await axios.get(downloadUri, { responseType: "stream" });
  const writer = createWriteStream(BULK_PATH);
  await pipeline(response.data, writer);
}

async function flushBatch(batch: ScryfallCard[]) {
  if (!batch.length) {
    return;
  }

  for (const card of batch) {
    if (!shouldKeepCard(card)) {
      continue;
    }

    const image = getImageUris(card);
    const firstFace = card.card_faces?.[0];
    const manaCost = card.mana_cost ?? firstFace?.mana_cost ?? null;
    const colorsFromMana = extractColorsFromManaCost(manaCost).join(",");

    const fields = {
      name: card.name,
      setCode: card.set.toLowerCase(),
      setName: card.set_name ?? null,
      collectorNumber: card.collector_number.toLowerCase(),
      releasedAt: card.released_at ?? null,
      lang: card.lang ?? null,
      usdPrice: card.prices?.usd ?? card.prices?.usd_foil ?? null,
      manaCost,
      typeLine: card.type_line ?? firstFace?.type_line ?? null,
      oracleText: card.oracle_text ?? firstFace?.oracle_text ?? null,
      power: card.power ?? null,
      toughness: card.toughness ?? null,
      colors: colorsFromMana,
      colorIdentity: (card.color_identity ?? []).join(","),
      imagePng: image.png ?? null,
      imageSmall: image.small ?? null,
      imageNormal: image.normal ?? null,
      imageLarge: image.large ?? null,
      isBasicLand: isBasicLand(card),
      isCommanderLegal: card.legalities?.commander === "legal",
      rarity: card.rarity ?? null
    };

    await prisma.card.upsert({
      where: { scryfallId: card.id },
      create: { scryfallId: card.id, ...fields, randomWeight: 1 },
      update: fields
    });
  }
}

export async function syncScryfallBulk() {
  const uri = await getDefaultCardsDownloadUri();
  console.log(`Downloading bulk data from ${uri}`);
  await downloadBulkJson(uri);

  const source = createReadStream(BULK_PATH);
  const jsonParser = streamJson.parser();
  const arrayStreamer = StreamArray.streamArray();
  source.pipe(jsonParser).pipe(arrayStreamer);

  const batch: ScryfallCard[] = [];
  let seen = 0;

  for await (const chunk of arrayStreamer) {
    const card = chunk.value as ScryfallCard;
    batch.push(card);
    seen += 1;

    if (batch.length >= 100) {
      await flushBatch(batch.splice(0, batch.length));
      if (seen % 1000 === 0) {
        console.log(`Processed ${seen} cards...`);
      }
    }
  }

  await flushBatch(batch);
  await rm(TMP_DIR, { recursive: true, force: true });

  // Card catalogue changed — purge cached groupBy data so the next drop
  // picks from the fresh card pool.
  invalidateCardPoolCache();
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isEntrypoint) {
  syncScryfallBulk()
    .then(async () => {
      console.log("Scryfall sync complete.");
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error("Scryfall sync failed.", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
