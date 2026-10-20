import type { TorrentRef, TransmissionTorrent, TxInstance } from './types'

/** Error carrying an HTTP status, so route handlers can respond appropriately. */
export class TransmissionError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'TransmissionError'
    this.status = status
  }
}

/** A Transmission daemon this app reads torrents from and removes them in. */
export type Instance = {
  name: TxInstance
  url: string
  deleteData: boolean
}

const TORRENT_FIELDS = ['id', 'name', 'status', 'rateUpload', 'rateDownload']

// Transmission's CSRF guard: every request must echo the latest session id,
// which it hands out on a 409. Kept across calls (per daemon) so only the first
// one (or the first after a daemon restart) pays the extra round trip.
const sessionIds = new Map<TxInstance, string>()

/**
 * The configured daemons. The main one's finished downloads are hardlinked
 * into the media library, so removing a torrent there also deletes its files:
 * that only drops the extra link. The optional external one downloads to a
 * drive that isn't part of the library, where the torrent's files are the only
 * copy, so removing a torrent there must never touch them.
 */
export function getInstances(): Instance[] {
  const main = process.env.TRANSMISSION_RPC_URL
  if (!main) {
    throw new TransmissionError('TRANSMISSION_RPC_URL is not configured on the server.', 500)
  }
  const instances: Instance[] = [{ name: 'main', url: main, deleteData: true }]

  const external = process.env.TRANSMISSION_EXTERNAL_RPC_URL
  if (external) instances.push({ name: 'external', url: external, deleteData: false })
  return instances
}

async function request(instance: Instance, body: string): Promise<Response> {
  try {
    return await fetch(instance.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Transmission-Session-Id': sessionIds.get(instance.name) ?? '',
      },
      body,
    })
  } catch (err) {
    throw new TransmissionError(`Transmission connection failed: ${(err as Error).message}`)
  }
}

async function call<T>(instance: Instance, method: string, args: Record<string, unknown>): Promise<T> {
  const body = JSON.stringify({ method, arguments: args })

  let res = await request(instance, body)
  if (res.status === 409) {
    sessionIds.set(instance.name, res.headers.get('X-Transmission-Session-Id') ?? '')
    res = await request(instance, body)
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

/** List every torrent in one Transmission daemon. */
export async function getTorrents(instance: Instance): Promise<TransmissionTorrent[]> {
  const result = await call<{ torrents?: Omit<TransmissionTorrent, 'instance'>[] }>(
    instance,
    'torrent-get',
    { fields: TORRENT_FIELDS }
  )
  return (result.torrents ?? []).map((t) => ({ ...t, instance: instance.name }))
}

/**
 * Remove torrents from whichever daemon each belongs to. Whether their files
 * go too is decided here by the daemon, never by the caller.
 */
export async function removeTorrents(refs: TorrentRef[]): Promise<void> {
  const instances = getInstances()

  // Resolve every ref before removing anything, so a bad one can't leave the
  // request half done.
  const ids = new Map<Instance, number[]>()
  for (const ref of refs) {
    const instance = instances.find((i) => i.name === ref.instance)
    if (!instance) {
      throw new TransmissionError(`The ${ref.instance} Transmission is not configured on the server.`, 400)
    }
    ids.set(instance, [...(ids.get(instance) ?? []), ref.id])
  }

  for (const [instance, group] of ids) {
    await call(instance, 'torrent-remove', { ids: group, 'delete-local-data': instance.deleteData })
  }
}
