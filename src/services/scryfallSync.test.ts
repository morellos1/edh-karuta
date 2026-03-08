import test from "node:test";
import assert from "node:assert/strict";
import { isBasicLand, shouldKeepCard } from "./scryfallSync.js";

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
