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

describe('transmission', () => {
  it('retries with the session id handed out on a 409, and keeps it', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 409, headers: { 'X-Transmission-Session-Id': 'sid' } }))
      .mockResolvedValueOnce(rpcResponse({ torrents: [{ id: 1, name: 'a' }] }))
      .mockResolvedValueOnce(rpcResponse({ torrents: [] }))

    expect(await tx.getTorrents()).toEqual([{ id: 1, name: 'a' }])
    expect(sessionHeader(0)).toBe('')
    expect(sessionHeader(1)).toBe('sid')

    await tx.getTorrents()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sessionHeader(2)).toBe('sid')
  })

  it('removes torrents together with their data', async () => {
    fetchMock.mockResolvedValueOnce(rpcResponse({}))
    await tx.removeTorrents([3, 4])
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toEqual({
      method: 'torrent-remove',
      arguments: { ids: [3, 4], 'delete-local-data': true },
    })
  })

  it('raises on an RPC-level failure', async () => {
    fetchMock.mockResolvedValueOnce(rpcResponse({}, 'invalid argument'))
    await expect(tx.getTorrents()).rejects.toThrow('Transmission RPC error: invalid argument.')
  })

  it('raises on an HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(tx.getTorrents()).rejects.toBeInstanceOf(tx.TransmissionError)
  })

  it('raises a TransmissionError when the daemon is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(tx.getTorrents()).rejects.toThrow('Transmission connection failed: fetch failed')
  })

  it('requires TRANSMISSION_RPC_URL', async () => {
    vi.stubEnv('TRANSMISSION_RPC_URL', '')
    await expect(tx.getTorrents()).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
