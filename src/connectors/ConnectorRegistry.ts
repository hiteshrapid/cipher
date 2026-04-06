// CIPHER — ConnectorRegistry
// Manages data source plugins and polling

import type { Connector, ConnectorData } from '../types'

type Listener = (data: ConnectorData) => void

class ConnectorRegistry {
  private connectors  = new Map<string, Connector>()
  private intervals   = new Map<string, ReturnType<typeof setInterval>>()
  private listeners   = new Set<Listener>()
  private data        = new Map<string, ConnectorData>()

  register(connector: Connector, pollMs = 60_000) {
    this.connectors.set(connector.id, connector)

    // Seed with loading state
    const seed: ConnectorData = {
      id: connector.id,
      label: connector.label,
      status: 'loading',
      data: {},
      lastUpdated: 0,
    }
    this.data.set(connector.id, seed)
    this.notify(seed)

    // First poll immediately
    this.poll(connector.id)

    // Then on interval
    const iv = setInterval(() => this.poll(connector.id), pollMs)
    this.intervals.set(connector.id, iv)
  }

  unregister(id: string) {
    const iv = this.intervals.get(id)
    if (iv) clearInterval(iv)
    this.connectors.delete(id)
    this.intervals.delete(id)
    this.data.delete(id)
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    // Replay existing data
    this.data.forEach(d => fn(d))
    return () => this.listeners.delete(fn)
  }

  getAll(): ConnectorData[] {
    return Array.from(this.data.values())
  }

  async forceRefresh(id?: string) {
    if (id) {
      await this.poll(id)
    } else {
      await Promise.all(Array.from(this.connectors.keys()).map(k => this.poll(k)))
    }
  }

  private async poll(id: string) {
    const connector = this.connectors.get(id)
    if (!connector) return

    try {
      const raw = await connector.poll()
      const d: ConnectorData = {
        id,
        label: connector.label,
        status: 'connected',
        data: raw,
        lastUpdated: Date.now(),
      }
      this.data.set(id, d)
      this.notify(d)
    } catch (err) {
      const d: ConnectorData = {
        id,
        label: connector.label,
        status: 'error',
        data: this.data.get(id)?.data ?? {},
        lastUpdated: Date.now(),
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      }
      this.data.set(id, d)
      this.notify(d)
    }
  }

  private notify(d: ConnectorData) {
    this.listeners.forEach(fn => fn(d))
  }

  destroy() {
    this.intervals.forEach(iv => clearInterval(iv))
    this.intervals.clear()
    this.connectors.clear()
    this.listeners.clear()
  }
}

// Singleton
export const registry = new ConnectorRegistry()
