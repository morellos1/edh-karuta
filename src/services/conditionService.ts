import { gameConfig, CONDITION_MULTIPLIERS } from "../config.js";

type CardCondition = "poor" | "good" | "mint";

const CONDITIONS: CardCondition[] = ["poor", "good", "mint"];

export function pickRandomCondition(): CardCondition {
  const r = Math.random();
  let acc = 0;
  const rawChances = [
    gameConfig.dropCondition.poorChance,
    gameConfig.dropCondition.goodChance,
    gameConfig.dropCondition.mintChance
  ];
  const sum = rawChances.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const scale = sum > 0 ? 1 / sum : 1 / CONDITIONS.length;
  for (let i = 0; i < CONDITIONS.length; i++) {
    const chance = sum > 0 ? (Number.isFinite(rawChances[i]) ? rawChances[i] : 0) : 1;
    acc += chance * scale;
    if (r < acc) return CONDITIONS[i];
  }
  return "good";
}

export function getConditionMultiplier(condition: string | null | undefined): number {
  if (!condition) return 3;
  const c = condition.toLowerCase();
  return CONDITION_MULTIPLIERS[c] ?? 3;
}

/** Returns gold value (integer) for a card: baseUsd × 100 × condition multiplier. */
export function getGoldValue(
  baseUsd: string | null | undefined,
  condition: string | null | undefined
): number {
  const base = baseUsd != null ? Number(baseUsd) : NaN;
  if (!Number.isFinite(base)) return 0;
  const mult = getConditionMultiplier(condition);
  return Math.round(base * 100 * mult);
}

/** Format base USD price × 100 × condition multiplier as gold (no decimals). */
export function formatConditionPrice(
  baseUsd: string | null | undefined,
  condition: string | null | undefined
): string {
  const base = baseUsd != null ? Number(baseUsd) : NaN;
  if (!Number.isFinite(base)) return "N/A";
  const mult = getConditionMultiplier(condition);
  const gold = Math.round(base * 100 * mult);
  return `${gold} gold`;
}

export function formatConditionLabel(condition: string | null | undefined): string {
  if (!condition) return "Unknown";
  const c = condition.toLowerCase();
  if (c === "poor" || c === "good" || c === "mint") {
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  return condition.charAt(0).toUpperCase() + condition.slice(1).toLowerCase();
}

const CONDITION_CLAIM_PHRASES: Record<string, string> = {
  poor: "Its condition is quite **poor**.",
  good: "It's in **good** condition.",
  mint: "Wow, it appears to be in **mint** condition!"
};

export function getConditionClaimPhrase(condition: string | null | undefined): string {
  if (!condition) return "It's in **good** condition.";
  return CONDITION_CLAIM_PHRASES[condition.toLowerCase()] ?? "It's in **good** condition.";
}
