/**
 * Data migration: recompute Card.colors from Card.manaCost.
 *
 * Run with: npx tsx prisma/recompute-colors.ts
 */
import { PrismaClient } from "@prisma/client";

const MANA_COLOR_SYMBOLS = new Set(["W", "U", "B", "R", "G"]);

function extractColorsFromManaCost(manaCost: string | null): string {
  if (!manaCost) return "";
  const symbols = new Set<string>();
  for (const match of manaCost.matchAll(/\{([^}]+)\}/g)) {
    for (const ch of match[1].toUpperCase()) {
      if (MANA_COLOR_SYMBOLS.has(ch)) {
        symbols.add(ch);
      }
    }
  }
  return ["W", "U", "B", "R", "G"].filter((s) => symbols.has(s)).join(",");
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const cards = await prisma.card.findMany({
      select: { id: true, manaCost: true, colors: true },
    });

    let updated = 0;
    for (const card of cards) {
      const newColors = extractColorsFromManaCost(card.manaCost);
      if (newColors !== (card.colors ?? "")) {
        await prisma.card.update({
          where: { id: card.id },
          data: { colors: newColors },
        });
        updated++;
      }
    }

    console.log(`Recomputed colors for ${updated} of ${cards.length} cards.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Recompute colors failed:", err);
  process.exit(1);
});
