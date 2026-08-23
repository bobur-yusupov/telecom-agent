// SPEC.md §14.3 — batch a burst of Telegram messages into one agent turn.
// Per-thread, in-memory, ephemeral — a deliberate narrow exception to
// principle 7 ("state lives in Postgres"); see §14.3's rationale.

const DEBOUNCE_MS = 2000;
const MAX_WAIT_MS = 8000;

interface Buffer {
  messages: string[];
  firstMessageAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const buffers = new Map<string, Buffer>();

function scheduleFlush(threadKey: string, buf: Buffer, onFlush: (joinedText: string) => void) {
  const elapsed = Date.now() - buf.firstMessageAt;
  const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - elapsed));
  return setTimeout(() => {
    buffers.delete(threadKey);
    onFlush(buf.messages.join('\n'));
  }, delay);
}

export function bufferMessage(threadKey: string, text: string, onFlush: (joinedText: string) => void): void {
  const existing = buffers.get(threadKey);

  if (existing) {
    existing.messages.push(text);
    clearTimeout(existing.timer);
    existing.timer = scheduleFlush(threadKey, existing, onFlush);
    return;
  }

  const buf: Buffer = { messages: [text], firstMessageAt: Date.now(), timer: undefined as unknown as ReturnType<typeof setTimeout> };
  buf.timer = scheduleFlush(threadKey, buf, onFlush);
  buffers.set(threadKey, buf);
}
