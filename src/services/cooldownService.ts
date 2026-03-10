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

  const record = await prisma.claimCooldown.findUnique({
    where: { userId },
    select: { lastClaimedAt: true }
  });

  if (!record) {
    return 0;
  }

  return computeRemainingCooldownMs(record.lastClaimedAt.getTime(), cooldownSeconds);
}
