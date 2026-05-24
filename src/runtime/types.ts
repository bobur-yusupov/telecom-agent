/**
 * Channel-agnostic message contracts.
 *
 * A channel adapter (Telegram, web chat, CLI, …) translates its platform events
 * into these shapes and renders {@link OutboundMessage}s back to the user. The
 * runtime and the Mirzo agent never import anything channel-specific — adding a
 * new channel means writing one adapter, with no changes here or in the agent.
 */

export interface InboundMessage {
  /** Stable per-conversation key chosen by the channel, e.g. `telegram:42`. */
  conversationId: string
  /** Channel name, e.g. `telegram`, `web`. Used for identity binding. */
  channel: string
  /** The channel's own id for this end user (chat id, session id, …) as a string. */
  externalUserId: string
  /** User text. `null` signals unsupported content (photo, voice, sticker, …). */
  text: string | null
  /** Lifecycle command the channel parsed from the input, if any. */
  command?: 'start' | 'end'
}

export interface OutboundMessage {
  text: string
}

/**
 * Optional capabilities a channel may expose to the runtime. Every field is
 * optional; the runtime degrades gracefully when a channel can't provide it.
 */
export interface ChannelContext {
  /** Show a "typing"/working indicator, if the channel supports one. */
  sendTyping?: () => Promise<void>
}
