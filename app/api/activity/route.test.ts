import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { getActivity } from '@/lib/activity'
import { NcoreError } from '@/lib/ncore'

vi.mock('@/lib/activity', () => ({ getActivity: vi.fn() }))

const mockGetActivity = vi.mocked(getActivity)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/activity', () => {
  it('returns the activity', async () => {
    mockGetActivity.mockResolvedValue({ entries: [], unmatched: [] })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entries: [], unmatched: [] })
  })

  it('maps an nCore failure to its status', async () => {
    mockGetActivity.mockRejectedValue(new NcoreError('nCore login failed.', 401))
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'nCore login failed.' })
  })
})
