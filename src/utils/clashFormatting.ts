import { EmbedBuilder } from "discord.js";
import type { ClashStats, BattleEvent, BattleResult } from "../services/clashService.js";
import { COLOR_CIRCLE_BY_SYMBOL } from "./cardFormatting.js";

// ---------------------------------------------------------------------------
// Color Emoji Mapping — extends cardFormatting's COLOR_CIRCLE_BY_SYMBOL with
// a "C" (colorless) entry for clash-specific usage.
// ---------------------------------------------------------------------------

const COLOR_EMOJI: Record<string, string> = {
  ...COLOR_CIRCLE_BY_SYMBOL,
  C: "\ud83d\udcbf"  // 💿 colorless
};

const COLOR_NAME: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Neutral"
};

export function colorEmoji(color: string): string {
  return COLOR_EMOJI[color] ?? "\u2b1c";
}

export function colorName(color: string): string {
  return COLOR_NAME[color] ?? "Neutral";
}

// ---------------------------------------------------------------------------
// HP Bar
// ---------------------------------------------------------------------------

const BAR_LENGTH = 10;
const FILLED = "\u2588"; // █
const EMPTY = "\u2591";  // ░

export function hpBar(current: number, max: number): string {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * BAR_LENGTH);
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled) + ` ${current}/${max} HP`;
}

// ---------------------------------------------------------------------------
// Attack Pattern Display
// ---------------------------------------------------------------------------

export function formatAttackPattern(pattern: string[]): string {
  return pattern
    .map((entry) => {
      if (entry.includes("/")) {
        const [a, b] = entry.split("/");
        return `${colorEmoji(a)}/${colorEmoji(b)}`;
      }
      return colorEmoji(entry);
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Stat Display Helpers
// ---------------------------------------------------------------------------

function formatStat(total: number, base: number): string {
  if (total !== base) {
    return `${total} (${base}+${total - base})`;
  }
  return `${total}`;
}

function formatCritRate(critRate: number, baseCritRate: number): string {
  const totalPct = Math.round(critRate * 100);
  const basePct = Math.round(baseCritRate * 100);
  if (totalPct !== basePct) {
    return `${totalPct}% (${basePct}%+${totalPct - basePct}%)`;
  }
  return `${totalPct}%`;
}

// ---------------------------------------------------------------------------
// Abilities Display
// ---------------------------------------------------------------------------

function formatAbilities(abilities: string[]): string {
  return abilities.map((a) => a.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")).join(", ");
}

function formatAbilitiesCompact(abilities: string[]): string {
  if (abilities.length === 0) return "";
  return ` (${formatAbilities(abilities)})`;
}

// ---------------------------------------------------------------------------
// Stats Embed (for /setcommander and /stats)
// ---------------------------------------------------------------------------

export function buildStatsEmbed(
  stats: ClashStats,
  cardImageUrl: string | null,
  condition: string,
  record?: string | null
): EmbedBuilder {
  const fields = [
    { name: "Attack", value: formatStat(stats.attack, stats.baseAttack), inline: true },
    { name: "Defense", value: formatStat(stats.defense, stats.baseDefense), inline: true },
    { name: "HP", value: formatStat(stats.hp, stats.baseHp), inline: true },
    { name: "Speed", value: formatStat(stats.speed, stats.baseSpeed), inline: true },
    { name: "Crit Rate", value: formatCritRate(stats.critRate, stats.baseCritRate), inline: true },
    { name: "Type", value: stats.colors.length > 0 ? stats.colors.map((c) => colorEmoji(c)).join(" ") : colorEmoji("C"), inline: true },
    { name: "Attack Pattern", value: formatAttackPattern(stats.attackPattern), inline: false }
  ];

  if (stats.abilities.length > 0) {
    fields.push({ name: "Abilities", value: formatAbilities(stats.abilities), inline: false });
  }

  if (record) {
    fields.push({ name: "Record", value: record, inline: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${stats.name} - Clash Stats`)
    .setColor(0xffa500)
    .addFields(...fields);

  if (cardImageUrl) {
    embed.setThumbnail(cardImageUrl);
  }

  embed.setFooter({ text: `Condition: ${condition.charAt(0).toUpperCase() + condition.slice(1)}` });

  return embed;
}

// ---------------------------------------------------------------------------
// Battle Event Formatting
// ---------------------------------------------------------------------------

export function formatBattleEvent(event: BattleEvent): string {
  const emoji = colorEmoji(event.attackColor);
  let line = `**${event.attacker}** uses a ${emoji} attack for **${event.damage}** dmg!`;

  if (event.isDoubleStrike) {
    line += " **DOUBLE STRIKE!**";
  }
  if (event.isCrit) {
    line += " **CRITICAL HIT!**";
  }
  if (event.effectiveness === "super") {
    line += " It's super effective!";
  } else if (event.effectiveness === "weak") {
    line += " It's not very effective...";
  }
  if (event.isDeathtouch) {
    line += " **DEATHTOUCH!** Finished off!";
  }
  if (event.healAmount && event.healAmount > 0) {
    line += ` Healed **${event.healAmount}** HP!`;
  }

  return line;
}

// ---------------------------------------------------------------------------
// Battle Embed (updated each tick)
// ---------------------------------------------------------------------------

export function buildBattleEmbed(
  statsA: ClashStats,
  statsB: ClashStats,
  events: BattleEvent[],
  attackNumber: number,
  maxAttacks: number,
  displayIdA: string,
  displayIdB: string
): EmbedBuilder {
  // Current HP from latest events
  let hpA = statsA.hp;
  let hpB = statsB.hp;
  for (const e of events) {
    if (e.defender === statsA.name) {
      hpA = e.defenderHpRemaining;
    } else if (e.defender === statsB.name) {
      hpB = e.defenderHpRemaining;
    }
  }

  // Last 5 events for the log
  const recentEvents = events.slice(-5);
  const log = recentEvents.map(formatBattleEvent).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Clash Battle!")
    .setColor(hpA >= hpB ? 0x57f287 : 0xed4245)
    .setDescription((log || "\u200b") + "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    .addFields(
      { name: `${statsA.name}${formatAbilitiesCompact(statsA.abilities)}\n\`${displayIdA}\``, value: hpBar(hpA, statsA.hp), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: `${statsB.name}${formatAbilitiesCompact(statsB.abilities)}\n\`${displayIdB}\``, value: hpBar(hpB, statsB.hp), inline: true }
    )
    .setFooter({ text: `Turn ${attackNumber}/${maxAttacks}` });

  return embed;
}

// ---------------------------------------------------------------------------
// Victory Embed
// ---------------------------------------------------------------------------

export function buildVictoryEmbed(
  result: BattleResult,
  statsA: ClashStats,
  statsB: ClashStats,
  displayIdA: string,
  displayIdB: string
): EmbedBuilder {
  const allLogLines = result.events.map(formatBattleEvent);

  const summaryLine = result.isDraw
    ? `Stalemate after ${result.events.length} turns! **${result.winner}** wins by tiebreak.`
    : result.events.length >= 100
      ? `Stalemate after ${result.events.length} turns! **${result.winner}** wins with more HP remaining.`
      : `**${result.winner}** defeats **${result.loser}** in ${result.events.length} turns!`;

  // Build full description, truncating log from the front if it exceeds Discord's 4096 char limit
  const overhead = summaryLine.length + 20; // separators + newlines
  const maxLogChars = 4096 - overhead;
  let log = allLogLines.join("\n");
  if (log.length > maxLogChars) {
    while (log.length > maxLogChars && allLogLines.length > 1) {
      allLogLines.shift();
      log = "...\n" + allLogLines.join("\n");
    }
  }

  const finalHpA = result.winner === statsA.name ? result.winnerHp : result.loserHp;
  const finalHpB = result.winner === statsB.name ? result.winnerHp : result.loserHp;

  const embed = new EmbedBuilder()
    .setTitle(`${result.winner} wins!`)
    .setColor(0xffd700)
    .setDescription(`${log}\n\n${summaryLine}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .addFields(
      { name: `${statsA.name}${formatAbilitiesCompact(statsA.abilities)}\n\`${displayIdA}\``, value: hpBar(finalHpA, statsA.hp), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: `${statsB.name}${formatAbilitiesCompact(statsB.abilities)}\n\`${displayIdB}\``, value: hpBar(finalHpB, statsB.hp), inline: true }
    );

  return embed;
}

// ---------------------------------------------------------------------------
// Challenge Embed
// ---------------------------------------------------------------------------

export function buildChallengeEmbed(
  challengerName: string,
  challengerStats: ClashStats,
  cardImageUrl: string | null,
  condition: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Clash Challenge!")
    .setColor(0xff6600)
    .setDescription(
      `**${challengerName}** challenges anyone to a Clash Battle!\n\n` +
      `Their commander: **${challengerStats.name}**\n\n` +
      `Click **Accept** to fight with your set commander!`
    )
    .addFields(
      { name: "Attack", value: formatStat(challengerStats.attack, challengerStats.baseAttack), inline: true },
      { name: "Defense", value: formatStat(challengerStats.defense, challengerStats.baseDefense), inline: true },
      { name: "HP", value: formatStat(challengerStats.hp, challengerStats.baseHp), inline: true },
      { name: "Speed", value: formatStat(challengerStats.speed, challengerStats.baseSpeed), inline: true },
      { name: "Crit Rate", value: formatCritRate(challengerStats.critRate, challengerStats.baseCritRate), inline: true },
      { name: "Type", value: challengerStats.colors.length > 0 ? challengerStats.colors.map((c) => colorEmoji(c)).join(" ") : colorEmoji("C"), inline: true },
      { name: "Attack Pattern", value: formatAttackPattern(challengerStats.attackPattern), inline: false }
    );

  if (challengerStats.abilities.length > 0) {
    embed.addFields({ name: "Abilities", value: formatAbilities(challengerStats.abilities), inline: false });
  }

  embed.setFooter({ text: `Condition: ${condition.charAt(0).toUpperCase() + condition.slice(1)}` });

  if (cardImageUrl) {
    embed.setThumbnail(cardImageUrl);
  }

  return embed;
}
