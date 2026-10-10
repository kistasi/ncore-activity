import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE } from './route'
import { removeAlias } from '@/lib/aliases-db'

vi.mock('@/lib/aliases-db', () => ({ removeAlias: vi.fn() }))

const mockRemove = vi.mocked(removeAlias)

// The route reads ctx.params (a promise) for the dynamic [id] segment.
function ctx(id: string) {
  return { params: Promise.resolve({ id }) } as Parameters<typeof DELETE>[1]
}

const request = new Request('http://localhost/api/aliases/1', { method: 'DELETE' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DELETE /api/aliases/[id]', () => {
  it('removes the alias', async () => {
    mockRemove.mockResolvedValue(true)
    const res = await DELETE(request, ctx('3'))
    expect(res.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith(3)
  })

  it('answers 404 for an unknown alias', async () => {
    mockRemove.mockResolvedValue(false)
    expect((await DELETE(request, ctx('3'))).status).toBe(404)
  })

  it('rejects a malformed id', async () => {
    expect((await DELETE(request, ctx('abc'))).status).toBe(400)
    expect(mockRemove).not.toHaveBeenCalled()
  })
})
