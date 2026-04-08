// CIPHER — Smart Search Engine
// Cascading search: OpenAI → DuckDuckGo → Wikipedia

import type { SearchResult } from '../types'

export async function smartSearch(query: string): Promise<SearchResult> {
  // Try OpenAI first
  if (import.meta.env.VITE_OPENAI_API_KEY) {
    try {
      return await searchOpenAI(query)
    } catch { /* fall through */ }
  }

  // Try DuckDuckGo
  try {
    return await searchDuckDuckGo(query)
  } catch { /* fall through */ }

  // Fallback: Wikipedia
  return await searchWikipedia(query)
}

async function searchOpenAI(query: string): Promise<SearchResult> {
  const res = await fetch('/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are CIPHER, an AI HUD assistant. Answer concisely. Format your response as exactly 3-5 bullet points, one per line, starting with '- '. Each bullet must be under 60 characters. Include the most relevant, current facts. Today's date: ${new Date().toLocaleDateString()}.`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: 300,
    }),
  })

  if (!res.ok) throw new Error(res.status.toString())

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''

  const bullets = text
    .split('\n')
    .filter((l: string) => l.trim().startsWith('- '))
    .map((l: string) => l.trim().replace(/^- /, ''))
    .slice(0, 5)

  return {
    query,
    title: query.charAt(0).toUpperCase() + query.slice(1),
    abstract: text,
    source: 'OpenAI',
    bullets,
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult> {
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  )

  if (!res.ok) throw new Error(res.status.toString())

  const data = await res.json()
  const abstract: string = data.AbstractText ?? ''

  if (!abstract) throw new Error('No abstract from DuckDuckGo')

  const relatedTopics: { Text?: string }[] = data.RelatedTopics ?? []
  const bullets = relatedTopics
    .slice(0, 4)
    .map((t: { Text?: string }) => {
      const text = t.Text ?? ''
      return text.length > 62 ? text.slice(0, 62) + '...' : text
    })
    .filter((t: string) => t.length > 0)

  return {
    query,
    title: (data.Heading as string) || query,
    abstract,
    source: 'DuckDuckGo',
    url: (data.AbstractURL as string) || undefined,
    bullets,
  }
}

async function searchWikipedia(query: string): Promise<SearchResult> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
    { headers: { accept: 'application/json; charset=utf-8' } }
  )

  if (!res.ok) throw new Error(res.status.toString())

  const data = await res.json()
  const title    = String(data.title ?? query)
  const abstract = String(data.extract ?? 'No summary available.')
  const url = (data.content_urls as { desktop?: { page?: string } } | undefined)
    ?.desktop?.page

  const bullets = abstract
    .split(/\.\s+/)
    .filter((s: string) => s.trim().length > 12)
    .slice(0, 4)
    .map((s: string) => {
      const clean = s.replace(/\s+/g, ' ').trim()
      return clean.length > 62 ? clean.slice(0, 62) + '...' : clean
    })

  return { query, title, abstract, source: 'Wikipedia', url, bullets }
}
