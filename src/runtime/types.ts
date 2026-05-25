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
 * How a channel receives replies and exposes optional capabilities. The runtime
 * pushes replies through {@link ChannelContext.send} rather than returning them,
 * because a turn's reply can arrive later than the message that triggered it
 * (e.g. after rapid partial messages are coalesced into one turn).
 */
export interface ChannelContext {
  /** Deliver one or more replies to the user. Called once per processed turn. */
  send: (messages: OutboundMessage[]) => Promise<void>
  /** Show a "typing"/working indicator, if the channel supports one. */
  sendTyping?: () => Promise<void>
}
