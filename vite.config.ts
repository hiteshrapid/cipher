import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions, Plugin } from 'vite'

// In-memory state sync between Chrome controller tab and OBS overlay
function cipherSyncPlugin(): Plugin {
  let syncState = '{}'
  return {
    name: 'cipher-sync',
    configureServer(server) {
      server.middlewares.use('/api/cipher-sync', (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            syncState = body
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
            res.end('{"ok":true}')
          })
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(syncState)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const githubToken = env.VITE_GITHUB_TOKEN || ''
  const gcalToken   = env.VITE_GCAL_TOKEN   || ''
  const slackToken  = env.VITE_SLACK_BOT_TOKEN || ''
  const gmailToken  = env.VITE_GMAIL_TOKEN || ''
  const linearToken = env.VITE_LINEAR_TOKEN || ''
  const openaiKey   = env.VITE_OPENAI_API_KEY || ''
  const cartesiaKey  = env.VITE_CARTESIA_API_KEY || ''

  const proxy: Record<string, ProxyOptions> = {}

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

  if (slackToken) {
    proxy['/slack'] = {
      target:       'https://slack.com',
      changeOrigin: true,
      rewrite:      (path: string) => path.replace(/^\/slack/, ''),
      headers:      { Authorization: `Bearer ${slackToken}` },
    }
  }

  if (gmailToken) {
    proxy['/gmail'] = {
      target:       'https://www.googleapis.com',
      changeOrigin: true,
      rewrite:      (path: string) => path.replace(/^\/gmail/, ''),
      headers:      { Authorization: `Bearer ${gmailToken}` },
    }
  }

  if (linearToken) {
    proxy['/linear'] = {
      target:       'https://api.linear.app',
      changeOrigin: true,
      rewrite:      (path: string) => path.replace(/^\/linear/, ''),
      headers:      { Authorization: linearToken },
    }
  }

  if (openaiKey) {
    proxy['/openai'] = {
      target:       'https://api.openai.com',
      changeOrigin: true,
      rewrite:      (path: string) => path.replace(/^\/openai/, ''),
      headers:      { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    }
  }

  if (cartesiaKey) {
    proxy['/cartesia'] = {
      target: 'https://api.cartesia.ai',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/cartesia/, ''),
      headers: { 'X-API-Key': cartesiaKey, 'Cartesia-Version': '2024-06-10' },
    }
  }

  return {
    plugins: [react(), cipherSyncPlugin()],
    server:  { proxy },
  }
})
