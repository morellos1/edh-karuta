import test from "node:test";
import assert from "node:assert/strict";
import { isBasicLand, isMeldResult, shouldKeepCard } from "./scryfallSync.js";

test("scryfall filter rejects basic lands", () => {
  const card = {
    object: "card",
    games: ["paper"],
    lang: "en",
    legalities: { commander: "legal" },
    type_line: "Basic Land - Plains"
  } as const;
  assert.equal(isBasicLand(card as any), true);
  assert.equal(shouldKeepCard(card as any), false);
});

test("scryfall filter rejects non-paper cards", () => {
  const card = {
    object: "card",
    games: ["arena"],
    lang: "en",
    legalities: { commander: "legal" },
    type_line: "Creature - Elf"
  } as const;
  assert.equal(shouldKeepCard(card as any), false);
});

test("scryfall filter rejects non-english cards", () => {
  const card = {
    object: "card",
    games: ["paper"],
    lang: "jp",
    legalities: { commander: "legal" },
    type_line: "Creature - Human"
  } as const;
  assert.equal(shouldKeepCard(card as any), false);
});

test("scryfall filter rejects non-commander-legal cards", () => {
  const card = {
    object: "card",
    games: ["paper"],
    lang: "en",
    legalities: { commander: "not_legal" },
    type_line: "Creature - Human"
  } as const;
  assert.equal(shouldKeepCard(card as any), false);
});

test("scryfall filter keeps commander-legal english paper cards", () => {
  const card = {
    object: "card",
    games: ["paper", "arena"],
    lang: "en",
    legalities: { commander: "legal" },
    type_line: "Creature - Human"
  } as const;
  assert.equal(shouldKeepCard(card as any), true);
});

test("isMeldResult identifies meld result cards", () => {
  const meldResult = {
    id: "abc",
    name: "Mishra, Lost to Phyrexia",
    layout: "meld",
    all_parts: [
      { id: "x", component: "meld_part", name: "Mishra, Claimed by Gix" },
      { id: "y", component: "meld_part", name: "Phyrexian Dragon Engine" },
      { id: "abc", component: "meld_result", name: "Mishra, Lost to Phyrexia" }
    ]
  } as any;
  assert.equal(isMeldResult(meldResult), true);
});

test("isMeldResult returns false for meld part cards", () => {
  const meldPart = {
    id: "x",
    name: "Mishra, Claimed by Gix",
    layout: "meld",
    all_parts: [
      { id: "x", component: "meld_part", name: "Mishra, Claimed by Gix" },
      { id: "y", component: "meld_part", name: "Phyrexian Dragon Engine" },
      { id: "abc", component: "meld_result", name: "Mishra, Lost to Phyrexia" }
    ]
  } as any;
  assert.equal(isMeldResult(meldPart), false);
});

test("isMeldResult returns false for non-meld cards", () => {
  const normal = {
    id: "z",
    name: "Sol Ring",
    layout: "normal"
  } as any;
  assert.equal(isMeldResult(normal), false);
});
