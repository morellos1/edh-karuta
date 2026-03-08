import { prisma } from "../db.js";

export function computeRemainingCooldownMs(
  lastClaimAtMs: number,
  cooldownSeconds: number,
  nowMs = Date.now()
) {
  if (cooldownSeconds <= 0) {
    return 0;
  }
  const nextAllowedAt = lastClaimAtMs + cooldownSeconds * 1000;
  return Math.max(0, nextAllowedAt - nowMs);
}

export async function getRemainingCooldownMs(userId: string, cooldownSeconds: number): Promise<number> {
  if (cooldownSeconds <= 0) {
    return 0;
  }

  const latest = await prisma.userCard.findFirst({
    where: { userId, drop: { dropType: "regular" } },
    orderBy: { claimedAt: "desc" },
    select: { claimedAt: true }
  });

  if (!latest) {
    return 0;
  }

  return computeRemainingCooldownMs(latest.claimedAt.getTime(), cooldownSeconds);
}
