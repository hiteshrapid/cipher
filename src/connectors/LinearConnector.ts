// CIPHER — LinearConnector
// Fetches assigned tickets from Linear GraphQL API
// Auth is handled server-side by the Vite proxy (see vite.config.ts + .env.local)

import type { Connector } from '../types'

const LINEAR_QUERY = `{
  viewer {
    assignedIssues(first: 10, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
      nodes {
        id
        identifier
        title
        state { name }
        priority
        url
      }
    }
  }
}`

export class LinearConnector implements Connector {
  id    = 'linear'
  label = 'Linear'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_opts: Record<string, string>) {
    // No special configuration needed — proxy handles auth
  }

  async poll(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch('/linear/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: LINEAR_QUERY }),
      })

      if (!res.ok) {
        return this.mockData()
      }

      const json = await res.json()
      const issues = json?.data?.viewer?.assignedIssues?.nodes

      if (!Array.isArray(issues)) {
        return this.mockData()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignedTickets = issues.map((issue: any) => ({
        id:         issue.id ?? '',
        identifier: issue.identifier ?? '',
        title:      issue.title ?? '(no title)',
        state:      issue.state?.name ?? 'Unknown',
        priority:   issue.priority ?? 0,
        url:        issue.url ?? '#',
      }))

      return {
        assignedTickets,
        projectName: 'Engineering',
        isMock: false,
      } as unknown as Record<string, unknown>
    } catch {
      return this.mockData()
    }
  }

  private mockData(): Record<string, unknown> {
    return {
      assignedTickets: [
        { id: 'mock1', identifier: 'ENG-84', title: 'Fix deploy pipeline timeout', state: 'In Progress', priority: 1, url: '#' },
        { id: 'mock2', identifier: 'ENG-79', title: 'DB migration for user preferences', state: 'Todo', priority: 2, url: '#' },
        { id: 'mock3', identifier: 'ENG-71', title: 'Add rate limiting to API gateway', state: 'In Review', priority: 2, url: '#' },
        { id: 'mock4', identifier: 'ENG-65', title: 'Update monitoring dashboards', state: 'Todo', priority: 3, url: '#' },
      ],
      projectName: 'Engineering',
      isMock: true,
    } as unknown as Record<string, unknown>
  }
}
