import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActivity } from './activity'
import { getAliases } from './aliases-db'
import { getHitAndRun, login } from './ncore'
import { getTorrents, TransmissionError } from './transmission'

vi.mock('./aliases-db', () => ({ getAliases: vi.fn() }))
vi.mock('./ncore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ncore')>()
  return { ...actual, login: vi.fn(), getHitAndRun: vi.fn() }
})
vi.mock('./transmission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transmission')>()
  return { ...actual, getTorrents: vi.fn() }
})

const mockLogin = vi.mocked(login)
const mockHnr = vi.mocked(getHitAndRun)
const mockTorrents = vi.mocked(getTorrents)
const mockAliases = vi.mocked(getAliases)

function entry(name: string) {
  return { name, status: 'Seed', remaining: '1h 0m', link: `https://ncore.pro/${name}` }
}

function torrent(id: number, name: string, status = 6, instance: 'main' | 'external' = 'main') {
  return { instance, id, name, status, rateUpload: 2048, rateDownload: 0 }
}

// Hand each daemon its own torrents, or an error to throw.
function daemons(lists: Record<string, ReturnType<typeof torrent>[] | Error>) {
  mockTorrents.mockImplementation(async (instance) => {
    const list = lists[instance.name] ?? []
    if (list instanceof Error) throw list
    return list
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NCORE_USERNAME', 'user')
  vi.stubEnv('NCORE_PASSWORD', 'pass')
  vi.stubEnv('TRANSMISSION_RPC_URL', 'http://tx/rpc')
  vi.stubEnv('TRANSMISSION_EXTERNAL_RPC_URL', 'http://ext/rpc')
  mockLogin.mockResolvedValue(true)
  mockAliases.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getActivity', () => {
  it('joins entries with their torrents and lists the leftovers', async () => {
    mockHnr.mockResolvedValue([entry('Metropolis.1927'), entry('Radírfej 720p')])
    daemons({ main: [torrent(1, 'Metropolis 1927 1080p'), torrent(2, 'Other', 0)] })

    const { entries, unmatched } = await getActivity()

    expect(entries[0]).toMatchObject({ txStatus: 6, txUpload: 2048, aliasId: null })
    expect(entries[1]).toMatchObject({ txStatus: null, txUpload: null })
    expect(unmatched).toEqual([
      { instance: 'main', id: 2, name: 'Other', txStatus: 0, txUpload: 2048, txDownload: 0 },
    ])
  })

  it('matches against the torrents of both daemons', async () => {
    mockHnr.mockResolvedValue([entry('Metropolis.1927'), entry('Radírfej 720p')])
    daemons({
      main: [torrent(1, 'Metropolis 1927 1080p')],
      external: [torrent(1, 'Radírfej 720p', 0, 'external'), torrent(2, 'Other', 6, 'external')],
    })

    const { entries, unmatched } = await getActivity()
    expect(entries.map((e) => e.txStatus)).toEqual([6, 0])
    expect(unmatched.map((t) => [t.instance, t.id])).toEqual([['external', 2]])
  })

  it('still lists the main torrents when the external daemon is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockHnr.mockResolvedValue([entry('Metropolis.1927')])
    daemons({ main: [torrent(1, 'Metropolis 1927')], external: new TransmissionError('down') })

    const { entries } = await getActivity()
    expect(entries[0].txStatus).toBe(6)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('external Transmission'))
  })

  it('reports which entries carry an alias', async () => {
    mockHnr.mockResolvedValue([entry('Radírfej 720p')])
    daemons({ main: [torrent(5, 'Eraserhead.1977')] })
    mockAliases.mockResolvedValue([{ id: 7, ncoreName: 'Radírfej 720p', transmissionName: 'Eraserhead 1977' }])

    const { entries, unmatched } = await getActivity()
    expect(entries[0]).toMatchObject({ txStatus: 6, aliasId: 7 })
    expect(unmatched).toEqual([])
  })

  it('still lists entries when Transmission is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockHnr.mockResolvedValue([entry('a')])
    daemons({ main: new TransmissionError('down'), external: new TransmissionError('down') })

    const { entries, unmatched } = await getActivity()
    expect(entries).toHaveLength(1)
    expect(entries[0].txStatus).toBeNull()
    expect(unmatched).toEqual([])
  })

  it('raises a 401 when the login fails', async () => {
    mockLogin.mockResolvedValue(false)
    await expect(getActivity()).rejects.toMatchObject({ status: 401 })
    expect(mockHnr).not.toHaveBeenCalled()
  })

  it('raises a 500 when credentials are not configured', async () => {
    vi.stubEnv('NCORE_PASSWORD', '')
    await expect(getActivity()).rejects.toMatchObject({ status: 500 })
    expect(mockLogin).not.toHaveBeenCalled()
  })
})
