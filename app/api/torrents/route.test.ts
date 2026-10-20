import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE } from './route'
import { removeTorrents, TransmissionError } from '@/lib/transmission'

vi.mock('@/lib/transmission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/transmission')>()
  return { ...actual, removeTorrents: vi.fn() }
})

const mockRemove = vi.mocked(removeTorrents)

function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/torrents', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DELETE /api/torrents', () => {
  it('removes the given torrents', async () => {
    const torrents = [
      { instance: 'main', id: 1 },
      { instance: 'external', id: 1 },
    ]
    const res = await DELETE(deleteRequest({ torrents }))
    expect(res.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith(torrents)
  })

  it.each([
    ['no body', 'not json'],
    ['no torrents', {}],
    ['an empty list', { torrents: [] }],
    ['a bare id', { torrents: [1] }],
    ['a non-positive id', { torrents: [{ instance: 'main', id: 0 }] }],
    ['a non-integer id', { torrents: [{ instance: 'main', id: '1' }] }],
    ['an unknown instance', { torrents: [{ instance: 'other', id: 1 }] }],
    ['a missing instance', { torrents: [{ id: 1 }] }],
  ])('rejects %s without touching Transmission', async (_label, body) => {
    const res = await DELETE(deleteRequest(body))
    expect(res.status).toBe(400)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('passes on a Transmission failure', async () => {
    mockRemove.mockRejectedValue(new TransmissionError('Transmission RPC returned HTTP 401.'))
    const res = await DELETE(deleteRequest({ torrents: [{ instance: 'main', id: 1 }] }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Transmission RPC returned HTTP 401.' })
  })
})
