import type {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  Message
} from "discord.js";

const RETRYABLE_CODES = new Set([
  "EPIPE",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNABORTED",
  "UND_ERR_SOCKET"
]);

const RETRYABLE_MESSAGE_FRAGMENTS = ["EPIPE", "socket hang up", "ECONNRESET", "other side closed"];

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  if (e.code && RETRYABLE_CODES.has(e.code)) return true;
  if (e.cause?.code && RETRYABLE_CODES.has(e.cause.code)) return true;
  if (e.message && RETRYABLE_MESSAGE_FRAGMENTS.some((f) => e.message!.includes(f))) return true;
  return false;
}

const MAX_RETRIES = 2;

export async function editReplyWithRetry(
  interaction: ChatInputCommandInteraction,
  payload: InteractionEditReplyOptions
): Promise<Message> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await interaction.editReply(payload);
    } catch (err) {
      lastError = err;
      if (isRetryable(err) && attempt < MAX_RETRIES) {
        console.warn(
          `[discordRetry] editReply failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying:`,
          (err as Error).message
        );
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export function isConnectionError(err: unknown): boolean {
  return isRetryable(err);
}
