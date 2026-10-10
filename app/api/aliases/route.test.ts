import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { addAlias, DuplicateAliasError } from '@/lib/aliases-db'

vi.mock('@/lib/aliases-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aliases-db')>()
  return { ...actual, addAlias: vi.fn() }
})

const mockAdd = vi.mocked(addAlias)

function postRequest(body: unknown) {
  return new Request('http://localhost/api/aliases', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/aliases', () => {
  it('stores the trimmed names', async () => {
    const alias = { id: 1, ncoreName: 'A turné', transmissionName: 'Spinal Tap' }
    mockAdd.mockResolvedValue(alias)

    const res = await POST(postRequest({ ncoreName: ' A turné ', transmissionName: 'Spinal Tap ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ alias })
    expect(mockAdd).toHaveBeenCalledWith('A turné', 'Spinal Tap')
  })

  it('requires both names', async () => {
    const res = await POST(postRequest({ ncoreName: 'A turné', transmissionName: '  ' }))
    expect(res.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('answers 409 for a duplicate nCore name', async () => {
    mockAdd.mockRejectedValue(new DuplicateAliasError('A turné'))
    const res = await POST(postRequest({ ncoreName: 'A turné', transmissionName: 'x' }))
    expect(res.status).toBe(409)
  })
})
