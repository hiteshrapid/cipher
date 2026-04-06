// CIPHER — GitHubConnector
// Fetches open PRs assigned/requested for review + assigned issues from GitHub REST API
// Auth is handled server-side by the Vite proxy (see vite.config.ts + .env.local)

import type { Connector } from '../types'

export interface GitHubRepo {
  owner: string   // e.g. "acme-corp"
  repo:  string   // e.g. "backend"
}

export interface GitHubPR {
  number:    number
  title:     string
  state:     string
  author:    string
  reviewers: string[]
  url:       string
  updatedAt: string
}

export interface GitHubIssue {
  number:    number
  title:     string
  state:     string
  labels:    string[]
  url:       string
  updatedAt: string
}

export interface GitHubData {
  openPRs:        GitHubPR[]
  reviewRequested: GitHubPR[]
  assignedIssues: GitHubIssue[]
}

export class GitHubConnector implements Connector {
  id    = 'github'
  label = 'GitHub'
  private repos: GitHubRepo[] = []

  configure(opts: Record<string, string>) {
    // Expects: opts.repos = "owner/repo,owner2/repo2"
    if (opts.repos) {
      this.repos = opts.repos
        .split(',')
        .map(r => r.trim())
        .filter(Boolean)
        .map(r => {
          const [owner, repo] = r.split('/')
          return { owner: owner ?? '', repo: repo ?? '' }
        })
        .filter(r => r.owner && r.repo)
    }
  }

  async poll(): Promise<Record<string, unknown>> {
    const [openPRs, reviewRequested, assignedIssues] = await Promise.all([
      this.fetchOpenPRs(),
      this.fetchReviewRequested(),
      this.fetchAssignedIssues(),
    ])
    const data: GitHubData = { openPRs, reviewRequested, assignedIssues }
    return data as unknown as Record<string, unknown>
  }

  // PRs opened by the authenticated user across all configured repos
  private async fetchOpenPRs(): Promise<GitHubPR[]> {
    if (this.repos.length === 0) return []
    const results = await Promise.all(
      this.repos.map(({ owner, repo }) =>
        this.fetchPRsForRepo(owner, repo, 'open')
      )
    )
    return results.flat()
  }

  // PRs where the authenticated user has been asked to review
  private async fetchReviewRequested(): Promise<GitHubPR[]> {
    const res = await fetch(
      `/github/search/issues?q=is:pr+is:open+review-requested:@me&per_page=10`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`GitHub review-requested fetch failed: ${res.status}`)
    const json = await res.json()
    return (json.items ?? []).map(mapSearchItemToPR)
  }

  // Issues assigned to the authenticated user across all configured repos
  private async fetchAssignedIssues(): Promise<GitHubIssue[]> {
    const res = await fetch(
      `/github/issues?filter=assigned&state=open&per_page=10`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`GitHub assigned-issues fetch failed: ${res.status}`)
    const json = await res.json()
    // Filter out pull requests (GitHub issues endpoint returns both)
    return (json as unknown[])
      .filter((i: unknown) => !(i as { pull_request?: unknown }).pull_request)
      .map(mapIssue)
  }

  private async fetchPRsForRepo(owner: string, repo: string, state: string): Promise<GitHubPR[]> {
    const res = await fetch(
      `/github/repos/${owner}/${repo}/pulls?state=${state}&per_page=10`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`GitHub PR fetch failed for ${owner}/${repo}: ${res.status}`)
    const json = await res.json()
    return (json as unknown[]).map(mapPR)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPR(raw: any): GitHubPR {
  return {
    number:    raw.number ?? 0,
    title:     raw.title ?? '(no title)',
    state:     raw.state ?? 'open',
    author:    raw.user?.login ?? 'unknown',
    reviewers: (raw.requested_reviewers ?? []).map((r: { login: string }) => r.login),
    url:       raw.html_url ?? '',
    updatedAt: raw.updated_at ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSearchItemToPR(raw: any): GitHubPR {
  return {
    number:    raw.number ?? 0,
    title:     raw.title ?? '(no title)',
    state:     raw.state ?? 'open',
    author:    raw.user?.login ?? 'unknown',
    reviewers: [],
    url:       raw.html_url ?? '',
    updatedAt: raw.updated_at ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIssue(raw: any): GitHubIssue {
  return {
    number:    raw.number ?? 0,
    title:     raw.title ?? '(no title)',
    state:     raw.state ?? 'open',
    labels:    (raw.labels ?? []).map((l: { name: string }) => l.name),
    url:       raw.html_url ?? '',
    updatedAt: raw.updated_at ?? '',
  }
}
