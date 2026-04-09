// CIPHER — SlackConnector
// Fetches unread messages, mentions, and recent DMs from Slack API
// Auth is handled server-side by the Vite proxy (see vite.config.ts + .env.local)

import type { Connector } from '../types'

export class SlackConnector implements Connector {
  id    = 'slack'
  label = 'Slack'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_opts: Record<string, string>) {
    // No special configuration needed — proxy handles auth
  }

  async poll(): Promise<Record<string, unknown>> {
    try {
      const [convRes, searchRes] = await Promise.all([
        fetch('/slack/api/conversations.list?limit=10', {
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch('/slack/api/search.messages?query=to:me&count=5', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ])

      // Parse responses independently — one may fail while the other works
      let unreadCount = 0
      if (convRes.ok) {
        const convJson = await convRes.json()
        if (convJson.ok) {
          const channels = (convJson.channels ?? []) as Array<{ num_unread?: number }>
          unreadCount = channels.reduce(
            (sum: number, ch: { num_unread?: number }) => sum + (ch.num_unread ?? 0),
            0,
          )
        }
      }

      // Search is the main data source for mentions/DMs
      if (!searchRes.ok) return this.mockData()
      const searchJson = await searchRes.json()
      if (!searchJson.ok) return this.mockData()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matches = (searchJson.messages?.matches ?? []) as any[]

      const mentions = matches
        .filter((m: { channel?: { is_im?: boolean } }) => !m.channel?.is_im)
        .map(mapSlackMessage)

      const recentDMs = matches
        .filter((m: { channel?: { is_im?: boolean } }) => m.channel?.is_im)
        .map(mapSlackDM)

      return { unreadCount, mentions, recentDMs, isMock: false } as unknown as Record<string, unknown>
    } catch {
      return this.mockData()
    }
  }

  private mockData(): Record<string, unknown> {
    return {
      unreadCount: 4,
      mentions: [
        { channel: '#engineering', author: 'Sarah K.', text: 'Can you review the auth PR?', timestamp: new Date(Date.now() - 300000).toISOString(), isDM: false },
        { channel: '#deploys', author: 'CI Bot', text: 'Deploy v2.4.1 succeeded', timestamp: new Date(Date.now() - 900000).toISOString(), isDM: false },
        { channel: '#general', author: 'Mike L.', text: 'Standup in 10 minutes', timestamp: new Date(Date.now() - 1800000).toISOString(), isDM: false },
      ],
      recentDMs: [
        { channel: 'DM', author: 'Alex R.', text: 'Hey, are you free for a quick sync?', timestamp: new Date(Date.now() - 600000).toISOString(), isDM: true },
      ],
      isMock: true,
    } as unknown as Record<string, unknown>
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSlackMessage(raw: any) {
  return {
    channel: raw.channel?.name ? `#${raw.channel.name}` : '#unknown',
    author:  raw.username ?? raw.user ?? 'unknown',
    text:    raw.text ?? '',
    timestamp: raw.ts
      ? new Date(parseFloat(raw.ts) * 1000).toISOString()
      : new Date().toISOString(),
    isDM: false,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSlackDM(raw: any) {
  return {
    channel: 'DM',
    author:  raw.username ?? raw.user ?? 'unknown',
    text:    raw.text ?? '',
    timestamp: raw.ts
      ? new Date(parseFloat(raw.ts) * 1000).toISOString()
      : new Date().toISOString(),
    isDM: true,
  }
}
