// CIPHER — GmailConnector
// Fetches unread emails and recent threads from Gmail API
// Auth is handled server-side by the Vite proxy (see vite.config.ts + .env.local)

import type { Connector } from '../types'

export class GmailConnector implements Connector {
  id    = 'gmail'
  label = 'Gmail'
  private maxResults = '5'

  configure(opts: Record<string, string>) {
    if (opts.maxResults) {
      this.maxResults = opts.maxResults
    }
  }

  async poll(): Promise<Record<string, unknown>> {
    try {
      const listRes = await fetch(
        `/gmail/gmail/v1/users/me/messages?q=is:unread&maxResults=${this.maxResults}`,
        { headers: { 'Content-Type': 'application/json' } },
      )

      if (!listRes.ok) {
        return this.mockData()
      }

      const listJson = await listRes.json()
      const messageIds = ((listJson.messages ?? []) as Array<{ id: string }>).map(m => m.id)

      if (messageIds.length === 0) {
        return {
          unreadCount: 0,
          recentThreads: [],
          isMock: false,
        } as unknown as Record<string, unknown>
      }

      const threads = await Promise.all(
        messageIds.map(id => this.fetchMessageMetadata(id)),
      )

      return {
        unreadCount: listJson.resultSizeEstimate ?? threads.length,
        recentThreads: threads.filter(Boolean),
        isMock: false,
      } as unknown as Record<string, unknown>
    } catch {
      return this.mockData()
    }
  }

  private async fetchMessageMetadata(id: string) {
    const res = await fetch(
      `/gmail/gmail/v1/users/me/messages/${id}?format=metadata`,
      { headers: { 'Content-Type': 'application/json' } },
    )
    if (!res.ok) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any
    const headers = (json.payload?.headers ?? []) as Array<{ name: string; value: string }>

    const getHeader = (name: string) =>
      headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

    return {
      id:        json.id ?? id,
      subject:   getHeader('Subject') || '(no subject)',
      from:      getHeader('From'),
      snippet:   json.snippet ?? '',
      timestamp: json.internalDate
        ? new Date(parseInt(json.internalDate, 10)).toISOString()
        : new Date().toISOString(),
      unread:    (json.labelIds ?? []).includes('UNREAD'),
    }
  }

  private mockData(): Record<string, unknown> {
    return {
      unreadCount: 3,
      recentThreads: [
        { id: 'mock1', subject: 'PR #142 approved', from: 'github@notifications.com', snippet: 'Your pull request has been approved by 2 reviewers...', timestamp: new Date(Date.now() - 180000).toISOString(), unread: true },
        { id: 'mock2', subject: 'Sprint Review Notes', from: 'team@company.com', snippet: 'Here are the notes from today\'s sprint review...', timestamp: new Date(Date.now() - 3600000).toISOString(), unread: true },
        { id: 'mock3', subject: 'Weekly Digest', from: 'digest@linear.app', snippet: '12 issues completed this week across 3 projects...', timestamp: new Date(Date.now() - 7200000).toISOString(), unread: true },
      ],
      isMock: true,
    } as unknown as Record<string, unknown>
  }
}
