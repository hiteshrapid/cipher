import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

// ─── Google OAuth2 token auto-refresh ────────────────────────────────────────
function googleAuthPlugin(env: Record<string, string>): Plugin {
  let accessToken  = env.VITE_GOOGLE_ACCESS_TOKEN || ''
  const refreshToken  = env.VITE_GOOGLE_REFRESH_TOKEN || ''
  const clientId      = env.VITE_GOOGLE_CLIENT_ID || ''
  const clientSecret  = env.VITE_GOOGLE_CLIENT_SECRET || ''
  let tokenExpiresAt  = Date.now() + 3500 * 1000 // assume ~1hr from startup

  async function refreshAccessToken(): Promise<string> {
    if (!refreshToken || !clientId || !clientSecret) {
      console.warn('CIPHER: Missing Google refresh credentials, cannot auto-refresh')
      return accessToken
    }

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('CIPHER: Token refresh failed:', res.status, err)
        return accessToken
      }

      const data = await res.json() as { access_token: string; expires_in: number }
      accessToken = data.access_token
      tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000 // refresh 60s early
      console.log('CIPHER: Google token refreshed, expires in', data.expires_in, 's')
      return accessToken
    } catch (err) {
      console.error('CIPHER: Token refresh error:', err)
      return accessToken
    }
  }

  async function getValidToken(): Promise<string> {
    if (Date.now() >= tokenExpiresAt) {
      return refreshAccessToken()
    }
    return accessToken
  }

  // Middleware that proxies /gmail/* and /gcal/* with a fresh token
  function googleProxy(prefix: string) {
    return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = req.url
      if (!url || !url.startsWith(prefix)) return next()

      const token = await getValidToken()
      const targetPath = url.replace(prefix, '')
      const targetUrl = `https://www.googleapis.com${targetPath}`

      try {
        // Collect request body for POST requests
        let body: string | undefined
        if (req.method === 'POST' || req.method === 'PUT') {
          body = await new Promise<string>((resolve) => {
            let data = ''
            req.on('data', (chunk: Buffer) => { data += chunk.toString() })
            req.on('end', () => resolve(data))
          })
        }

        const upstream = await fetch(targetUrl, {
          method: req.method || 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          ...(body ? { body } : {}),
        })

        // If 401, try one refresh and retry
        if (upstream.status === 401) {
          console.log('CIPHER: Got 401, refreshing token and retrying...')
          const newToken = await refreshAccessToken()
          const retry = await fetch(targetUrl, {
            method: req.method || 'GET',
            headers: {
              Authorization: `Bearer ${newToken}`,
              'Content-Type': 'application/json',
            },
            ...(body ? { body } : {}),
          })
          res.writeHead(retry.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(await retry.text())
          return
        }

        res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(await upstream.text())
      } catch (err) {
        console.error('CIPHER: Google proxy error:', err)
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'proxy_error' }))
      }
    }
  }

  return {
    name: 'google-auth',
    configureServer(server) {
      // These middlewares intercept before Vite's proxy
      server.middlewares.use(googleProxy('/gmail'))
      server.middlewares.use(googleProxy('/gcal'))
    },
  }
}

// ─── In-memory state sync (controller ↔ OBS overlay) ─────────────────────────
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
  const slackToken  = env.VITE_SLACK_BOT_TOKEN || ''
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

  // Gmail + Calendar are handled by googleAuthPlugin middleware (auto-refresh)
  // No static proxy needed for /gmail or /gcal

  if (slackToken) {
    proxy['/slack'] = {
      target:       'https://slack.com',
      changeOrigin: true,
      rewrite:      (path: string) => path.replace(/^\/slack/, ''),
      headers:      { Authorization: `Bearer ${slackToken}` },
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
    plugins: [react(), cipherSyncPlugin(), googleAuthPlugin(env)],
    server:  { proxy },
  }
})
