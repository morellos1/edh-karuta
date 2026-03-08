/** Format a cooldown remaining time: shows seconds when < 60s, minutes otherwise. */
export function formatCooldownRemaining(remainingMs: number): string {
  if (remainingMs < 60_000) {
    const seconds = Math.ceil(remainingMs / 1000);
    return `**${seconds}** second${seconds !== 1 ? "s" : ""}`;
  }
  const minutes = Math.ceil(remainingMs / 60_000);
  return `**${minutes}** minute${minutes !== 1 ? "s" : ""}`;
}
