import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const jiraUrl   = env.VITE_JIRA_URL   || ''
  const jiraEmail = env.VITE_JIRA_EMAIL || ''
  const jiraToken = env.VITE_JIRA_TOKEN || ''

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

  return {
    plugins: [react()],
    server:  { proxy },
  }
})
