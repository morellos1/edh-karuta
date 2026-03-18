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
// Stats Embed (for /setcreature and /creaturestats)
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

  if (event.isCrit) {
    line += " **CRITICAL HIT!**";
  }
  if (event.effectiveness === "super") {
    line += " It's super effective!";
  } else if (event.effectiveness === "weak") {
    line += " It's not very effective...";
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
  imageUrlA: string | null,
  imageUrlB: string | null
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

  const barA = hpBar(hpA, statsA.hp);
  const barB = hpBar(hpB, statsB.hp);

  // Last 5 events for the log
  const recentEvents = events.slice(-5);
  const log = recentEvents.map(formatBattleEvent).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Clash Battle!")
    .setColor(hpA >= hpB ? 0x57f287 : 0xed4245)
    .setDescription(
      `**${statsA.name}**\n${barA}\n\n` +
      `**${statsB.name}**\n${barB}\n\n` +
      `---\n${log}`
    )
    .setFooter({ text: `Attack ${attackNumber}/${maxAttacks}` });

  if (imageUrlA) {
    embed.setThumbnail(imageUrlA);
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Victory Embed
// ---------------------------------------------------------------------------

export function buildVictoryEmbed(
  result: BattleResult,
  statsA: ClashStats,
  statsB: ClashStats
): EmbedBuilder {
  const allLogLines = result.events.map(formatBattleEvent);
  const hpSection =
    `**${result.winner === statsA.name ? statsA.name : statsB.name}**\n` +
    `${hpBar(result.winner === statsA.name ? result.winnerHp : result.loserHp, result.winner === statsA.name ? statsA.hp : statsB.hp)}\n\n` +
    `**${result.winner === statsA.name ? statsB.name : statsA.name}**\n` +
    `${hpBar(result.winner === statsA.name ? result.loserHp : result.winnerHp, result.winner === statsA.name ? statsB.hp : statsA.hp)}`;

  const summaryLine = result.isDraw
    ? `Stalemate after ${result.events.length} attacks! **${result.winner}** wins by tiebreak.`
    : result.events.length >= 100
      ? `Stalemate after ${result.events.length} attacks! **${result.winner}** wins with more HP remaining.`
      : `**${result.winner}** defeats **${result.loser}** in ${result.events.length} attacks!`;

  // Build full description, truncating log from the front if it exceeds Discord's 4096 char limit
  const overhead = hpSection.length + summaryLine.length + 20; // separators + newlines
  const maxLogChars = 4096 - overhead;
  let log = allLogLines.join("\n");
  if (log.length > maxLogChars) {
    // Trim from the beginning to keep the most recent events visible
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
    .setDescription(
      `**${statsA.name}**\n${hpBar(finalHpA, statsA.hp)}\n\n` +
      `**${statsB.name}**\n${hpBar(finalHpB, statsB.hp)}\n\n` +
      `---\n${log}\n\n` +
      summaryLine
    )
    .setFooter({ text: `Total attacks: ${result.events.length}` });

  return embed;
}

// ---------------------------------------------------------------------------
// Challenge Embed
// ---------------------------------------------------------------------------

export function buildChallengeEmbed(
  challengerName: string,
  challengerStats: ClashStats,
  cardImageUrl: string | null
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Clash Challenge!")
    .setColor(0xff6600)
    .setDescription(
      `**${challengerName}** challenges anyone to a Clash Battle!\n\n` +
      `Their creature: **${challengerStats.name}**\n` +
      `ATK: ${formatStat(challengerStats.attack, challengerStats.baseAttack)} | DEF: ${formatStat(challengerStats.defense, challengerStats.baseDefense)} | HP: ${formatStat(challengerStats.hp, challengerStats.baseHp)} | SPD: ${formatStat(challengerStats.speed, challengerStats.baseSpeed)}\n\n` +
      `Click **Accept** to fight with your set creature!`
    );

  if (cardImageUrl) {
    embed.setThumbnail(cardImageUrl);
  }

  return embed;
}
