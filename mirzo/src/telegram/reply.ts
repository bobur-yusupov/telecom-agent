// SPEC.md §14.4 — human-paced splitting. Step 1 (signal typing immediately,
// before any tool call) happens in adapter.ts, not here — this only handles
// the reply itself once the agent's full text is ready.

const MAX_BUBBLES = 3;

export function splitIntoBubbles(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length <= MAX_BUBBLES) return paragraphs;

  const head = paragraphs.slice(0, MAX_BUBBLES - 1);
  const tail = paragraphs.slice(MAX_BUBBLES - 1).join('\n\n');
  return [...head, tail];
}

export interface ReplyThread {
  startTyping: () => Promise<void>;
  post: (message: string) => Promise<unknown>;
}

export async function sendPacedReply(thread: ReplyThread, text: string): Promise<void> {
  const bubbles = splitIntoBubbles(text);

  for (let i = 0; i < bubbles.length; i++) {
    if (i > 0) {
      await thread.startTyping();
      const pauseMs = Math.min(900, Math.max(400, bubbles[i].length * 8));
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    await thread.post(bubbles[i]);
  }
}
