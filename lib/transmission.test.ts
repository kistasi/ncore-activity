import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn<typeof fetch>()
let tx: typeof import('./transmission')

function rpcResponse(args: unknown, result = 'success') {
  return new Response(JSON.stringify({ result, arguments: args }), { status: 200 })
}

beforeEach(async () => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('TRANSMISSION_RPC_URL', 'http://tx/rpc')
  vi.stubEnv('TRANSMISSION_EXTERNAL_RPC_URL', 'http://ext/rpc')
  // The session id is module state, so start each test with a fresh module.
  vi.resetModules()
  tx = await import('./transmission')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function sessionHeader(call: number): string {
  const init = fetchMock.mock.calls[call][1] as RequestInit
  return (init.headers as Record<string, string>)['X-Transmission-Session-Id']
}

function sentTo(call: number): { url: string; body: unknown } {
  const [url, init] = fetchMock.mock.calls[call]
  return { url: String(url), body: JSON.parse(String((init as RequestInit).body)) }
}

function instance(name: 'main' | 'external') {
  return tx.getInstances().find((i) => i.name === name)!
}

describe('transmission', () => {
  it('retries with the session id handed out on a 409, and keeps it', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 409, headers: { 'X-Transmission-Session-Id': 'sid' } }))
      .mockResolvedValueOnce(rpcResponse({ torrents: [{ id: 1, name: 'a' }] }))
      .mockResolvedValueOnce(rpcResponse({ torrents: [] }))

    expect(await tx.getTorrents(instance('main'))).toEqual([{ instance: 'main', id: 1, name: 'a' }])
    expect(sessionHeader(0)).toBe('')
    expect(sessionHeader(1)).toBe('sid')

    await tx.getTorrents(instance('main'))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sessionHeader(2)).toBe('sid')
  })

  it('keeps a separate session id per daemon', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 409, headers: { 'X-Transmission-Session-Id': 'sid' } }))
      .mockResolvedValueOnce(rpcResponse({ torrents: [] }))
      .mockResolvedValueOnce(rpcResponse({ torrents: [{ id: 1, name: 'b' }] }))

    await tx.getTorrents(instance('main'))
    expect(await tx.getTorrents(instance('external'))).toEqual([{ instance: 'external', id: 1, name: 'b' }])
    expect(sentTo(2).url).toBe('http://ext/rpc')
    expect(sessionHeader(2)).toBe('')
  })

  it('only configures the external daemon when its URL is set', async () => {
    expect(tx.getInstances().map((i) => i.name)).toEqual(['main', 'external'])
    vi.stubEnv('TRANSMISSION_EXTERNAL_RPC_URL', '')
    expect(tx.getInstances().map((i) => i.name)).toEqual(['main'])
  })

  it('deletes the data of main torrents but keeps that of external ones', async () => {
    fetchMock.mockImplementation(async () => rpcResponse({}))
    await tx.removeTorrents([
      { instance: 'main', id: 3 },
      { instance: 'external', id: 3 },
      { instance: 'main', id: 4 },
    ])

    expect(sentTo(0)).toEqual({
      url: 'http://tx/rpc',
      body: { method: 'torrent-remove', arguments: { ids: [3, 4], 'delete-local-data': true } },
    })
    expect(sentTo(1)).toEqual({
      url: 'http://ext/rpc',
      body: { method: 'torrent-remove', arguments: { ids: [3], 'delete-local-data': false } },
    })
  })

  it('removes nothing when a torrent belongs to an unconfigured daemon', async () => {
    vi.stubEnv('TRANSMISSION_EXTERNAL_RPC_URL', '')
    await expect(
      tx.removeTorrents([
        { instance: 'main', id: 1 },
        { instance: 'external', id: 2 },
      ])
    ).rejects.toMatchObject({ status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('raises on an RPC-level failure', async () => {
    fetchMock.mockResolvedValueOnce(rpcResponse({}, 'invalid argument'))
    await expect(tx.getTorrents(instance('main'))).rejects.toThrow('Transmission RPC error: invalid argument.')
  })

  it('raises on an HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(tx.getTorrents(instance('main'))).rejects.toBeInstanceOf(tx.TransmissionError)
  })

  it('raises a TransmissionError when the daemon is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(tx.getTorrents(instance('main'))).rejects.toThrow('Transmission connection failed: fetch failed')
  })

  it('requires TRANSMISSION_RPC_URL', async () => {
    vi.stubEnv('TRANSMISSION_RPC_URL', '')
    expect(() => tx.getInstances()).toThrow(expect.objectContaining({ status: 500 }))
    await expect(tx.removeTorrents([{ instance: 'main', id: 1 }])).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
