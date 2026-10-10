import { getAliases } from './aliases-db'
import { getHitAndRun, login, NcoreError } from './ncore'
import { matchTorrent } from './torrent-matcher'
import { getTorrents, TransmissionError } from './transmission'
import type { ActivityResponse, TransmissionTorrent } from './types'

/**
 * Join nCore's hit-and-run list with Transmission's torrents, so seeding
 * obligations that aren't actually being seeded stand out, and list whatever
 * is left in Transmission without an obligation behind it.
 */
export async function getActivity(): Promise<ActivityResponse> {
  const username = process.env.NCORE_USERNAME
  const password = process.env.NCORE_PASSWORD
  if (!username || !password) {
    throw new NcoreError('NCORE_USERNAME and NCORE_PASSWORD must be configured on the server.', 500)
  }

  if (!(await login(username, password))) {
    throw new NcoreError('nCore login failed.', 401)
  }

  const [hitAndRun, torrents, aliases] = await Promise.all([
    getHitAndRun(),
    getTorrentsOrNone(),
    getAliases(),
  ])

  const aliasIds = new Map(aliases.map((a) => [a.ncoreName, a.id]))
  const matchedIds = new Set<number>()

  const entries = hitAndRun.map((e) => {
    const matched = matchTorrent(e.name, torrents, aliases)
    if (matched) matchedIds.add(matched.id)
    return {
      ...e,
      txStatus: matched ? matched.status : null,
      txUpload: matched ? matched.rateUpload : null,
      aliasId: aliasIds.get(e.name) ?? null,
    }
  })

  const unmatched = torrents
    .filter((t) => !matchedIds.has(t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      txStatus: t.status,
      txUpload: t.rateUpload,
      txDownload: t.rateDownload,
    }))

  return { entries, unmatched }
}

// The hit-and-run list is still worth showing when Transmission is down; every
// entry just comes back unmatched.
async function getTorrentsOrNone(): Promise<TransmissionTorrent[]> {
  try {
    return await getTorrents()
  } catch (err) {
    if (!(err instanceof TransmissionError)) throw err
    console.warn(`Failed to fetch Transmission torrents: ${err.message}`)
    return []
  }
}
