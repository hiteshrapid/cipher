import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const jiraUrl   = env.VITE_JIRA_URL   || ''
  const jiraEmail = env.VITE_JIRA_EMAIL || ''
  const jiraToken = env.VITE_JIRA_TOKEN || ''

  const githubToken = env.VITE_GITHUB_TOKEN || ''
  const gcalToken   = env.VITE_GCAL_TOKEN   || ''

  const proxy: Record<string, ProxyOptions> = {}

  if (jiraUrl) {
    proxy['/jira'] = {
      target:      jiraUrl,
      changeOrigin: true,
      rewrite:     (path: string) => path.replace(/^\/jira/, ''),
      headers:     jiraEmail && jiraToken
        ? { Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}` }
        : {},
    }
  }

  if (githubToken) {
    proxy['/github'] = {
      target:      'https://api.github.com',
      changeOrigin: true,
      rewrite:     (path: string) => path.replace(/^\/github/, ''),
      headers:     { Authorization: `Bearer ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' },
    }
  }

  if (gcalToken) {
    proxy['/gcal'] = {
      target:      'https://www.googleapis.com',
      changeOrigin: true,
      rewrite:     (path: string) => path.replace(/^\/gcal/, ''),
      headers:     { Authorization: `Bearer ${gcalToken}` },
    }
  }

  return {
    plugins: [react()],
    server:  { proxy },
  }
})
