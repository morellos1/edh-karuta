/** Format a cooldown remaining time as a Discord relative timestamp (<t:UNIX:R>). */
export function formatCooldownRemaining(remainingMs: number): string {
  const unixSeconds = Math.floor((Date.now() + remainingMs) / 1000);
  return `<t:${unixSeconds}:R>`;
}
