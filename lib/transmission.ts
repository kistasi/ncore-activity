import type { TransmissionTorrent } from './types'

/** Error carrying an HTTP status, so route handlers can respond appropriately. */
export class TransmissionError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'TransmissionError'
    this.status = status
  }
}

const TORRENT_FIELDS = ['id', 'name', 'status', 'rateUpload', 'rateDownload']

// Transmission's CSRF guard: every request must echo the latest session id,
// which it hands out on a 409. Kept across calls so only the first one (or the
// first after a daemon restart) pays the extra round trip.
let sessionId = ''

function rpcUrl(): string {
  const url = process.env.TRANSMISSION_RPC_URL
  if (!url) {
    throw new TransmissionError('TRANSMISSION_RPC_URL is not configured on the server.', 500)
  }
  return url
}

async function request(body: string): Promise<Response> {
  try {
    return await fetch(rpcUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Transmission-Session-Id': sessionId,
      },
      body,
    })
  } catch (err) {
    if (err instanceof TransmissionError) throw err
    throw new TransmissionError(`Transmission connection failed: ${(err as Error).message}`)
  }
}

async function call<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const body = JSON.stringify({ method, arguments: args })

  let res = await request(body)
  if (res.status === 409) {
    sessionId = res.headers.get('X-Transmission-Session-Id') ?? ''
    res = await request(body)
  }

  if (!res.ok) {
    throw new TransmissionError(`Transmission RPC returned HTTP ${res.status}.`)
  }

  const data = (await res.json().catch(() => null)) as {
    result?: string
    arguments?: T
  } | null
  if (data?.result !== 'success') {
    throw new TransmissionError(`Transmission RPC error: ${data?.result ?? 'empty response'}.`)
  }
  return data.arguments as T
}

/** List every torrent in Transmission. */
export async function getTorrents(): Promise<TransmissionTorrent[]> {
  const result = await call<{ torrents?: TransmissionTorrent[] }>('torrent-get', {
    fields: TORRENT_FIELDS,
  })
  return result.torrents ?? []
}

/** Remove torrents along with their downloaded data. */
export async function removeTorrents(ids: number[]): Promise<void> {
  await call('torrent-remove', { ids, 'delete-local-data': true })
}
