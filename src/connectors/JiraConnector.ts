// CIPHER — JiraConnector
// Fetches active sprint + assigned issues from Jira Cloud REST API v3
// Auth is handled server-side by the Vite proxy (see vite.config.ts + .env.local)

import type { Connector, SprintData, JiraIssue } from '../types'

export interface JiraConfig {
  boardId: string   // numeric board ID from VITE_JIRA_BOARD_ID env
}

export class JiraConnector implements Connector {
  id    = 'jira'
  label = 'Jira'
  private boardId = '1'

  configure(opts: Record<string, string>) {
    if (opts.boardId) this.boardId = opts.boardId
  }

  async poll(): Promise<Record<string, unknown>> {
    const [sprint, issues] = await Promise.all([
      this.fetchActiveSprint(),
      this.fetchMyIssues(),
    ])
    return { sprint, issues }
  }

  private async fetchActiveSprint(): Promise<SprintData | null> {
    const res = await fetch(
      `/jira/rest/agile/1.0/board/${this.boardId}/sprint?state=active`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`Jira sprint fetch failed: ${res.status}`)

    const json = await res.json()
    const sprints: Array<{ id: number; name: string }> = json.values ?? []
    if (sprints.length === 0) return null
    const sprint = sprints[0]

    // Get issues in this sprint
    const issRes = await fetch(
      `/jira/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=50&fields=summary,status,priority,assignee`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!issRes.ok) throw new Error(`Jira sprint issues fetch failed: ${issRes.status}`)
    const issJson = await issRes.json()

    const all: JiraIssue[] = (issJson.issues ?? []).map(mapIssue)
    const open = all.filter(i => !DONE_STATUSES.includes(i.status.toLowerCase()))
    const done = all.filter(i =>  DONE_STATUSES.includes(i.status.toLowerCase()))

    return {
      sprintName: sprint.name,
      openCount:  open.length,
      doneCount:  done.length,
      totalCount: all.length,
      issues:     open.slice(0, 5),
    }
  }

  private async fetchMyIssues(): Promise<JiraIssue[]> {
    const jql = encodeURIComponent(
      'assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done ORDER BY priority ASC'
    )
    const res = await fetch(
      `/jira/rest/api/3/search?jql=${jql}&maxResults=10&fields=summary,status,priority`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`Jira my-issues fetch failed: ${res.status}`)
    const json = await res.json()
    return (json.issues ?? []).map(mapIssue)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DONE_STATUSES = ['done', 'closed', 'resolved', 'complete', 'completed']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIssue(raw: any): JiraIssue {
  return {
    key:      raw.key ?? '',
    summary:  raw.fields?.summary ?? '(no summary)',
    status:   raw.fields?.status?.name ?? 'Unknown',
    priority: raw.fields?.priority?.name ?? 'Medium',
    assignee: raw.fields?.assignee?.displayName,
  }
}
