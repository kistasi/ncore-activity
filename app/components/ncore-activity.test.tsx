import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NcoreActivity from './ncore-activity'
import type { ActivityResponse } from '@/lib/types'

const activity: ActivityResponse = {
  entries: [
    {
      name: 'Metropolis.1927',
      status: 'Seed',
      remaining: '22h 23m',
      link: 'https://ncore.pro/1',
      txStatus: 6,
      txUpload: 2048,
      aliasId: null,
    },
    {
      name: 'Radírfej 720p',
      status: 'Seed',
      remaining: '1d 0h 5m',
      link: 'https://ncore.pro/2',
      txStatus: null,
      txUpload: null,
      aliasId: null,
    },
    {
      name: 'A turné',
      status: 'Seed',
      remaining: '3h 0m',
      link: 'https://ncore.pro/3',
      txStatus: 0,
      txUpload: 0,
      aliasId: 4,
    },
  ],
  unmatched: [
    { id: 10, name: 'Eraserhead.1977', txStatus: 6, txUpload: 0, txDownload: 0 },
    { id: 11, name: 'Leftover', txStatus: 0, txUpload: 0, txDownload: 0 },
  ],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => json(activity))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function calls(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method)
}

describe('NcoreActivity', () => {
  it('lists entries with their Transmission state', async () => {
    render(<NcoreActivity />)

    expect(await screen.findByText('Metropolis.1927')).toBeInTheDocument()
    expect(screen.getByText('↑ 2.0 KB/s')).toBeInTheDocument()
    expect(screen.getAllByText('Stopped')).toHaveLength(2)
    expect(screen.getByText('Leftover')).toBeInTheDocument()
  })

  it('shows the API error', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'nCore login failed.' }, 401))
    render(<NcoreActivity />)
    expect(await screen.findByText('nCore login failed.')).toBeInTheDocument()
  })

  it('removes a torrent after confirmation', async () => {
    const user = userEvent.setup()
    render(<NcoreActivity />)
    await screen.findByText('Leftover')

    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await user.click(screen.getByRole('button', { name: 'Remove Leftover' }))

    await waitFor(() => expect(screen.queryByText('Leftover')).not.toBeInTheDocument())
    expect(JSON.parse(String(calls('DELETE')[0][1]?.body))).toEqual({ ids: [11] })
  })

  it('keeps the torrent when the removal is not confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup()
    render(<NcoreActivity />)
    await screen.findByText('Leftover')

    await user.click(screen.getByRole('button', { name: 'Remove Leftover' }))
    expect(calls('DELETE')).toHaveLength(0)
    expect(screen.getByText('Leftover')).toBeInTheDocument()
  })

  it('bulk-removes the selected torrents', async () => {
    const user = userEvent.setup()
    render(<NcoreActivity />)
    await screen.findByText('Leftover')

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }))

    expect(await screen.findByText('No unmatched torrents.')).toBeInTheDocument()
    expect(JSON.parse(String(calls('DELETE')[0][1]?.body))).toEqual({ ids: [10, 11] })
  })

  it('links an unmatched entry to a torrent and reloads', async () => {
    const user = userEvent.setup()
    render(<NcoreActivity />)
    await screen.findByText('Radírfej 720p')

    fetchMock.mockResolvedValueOnce(json({ alias: {} }))
    await user.click(screen.getByRole('combobox', { name: 'Link Radírfej 720p to a Transmission torrent' }))
    await user.click(within(screen.getByRole('listbox')).getByText('Eraserhead.1977'))

    await waitFor(() => expect(calls('POST')).toHaveLength(1))
    expect(JSON.parse(String(calls('POST')[0][1]?.body))).toEqual({
      ncoreName: 'Radírfej 720p',
      transmissionName: 'Eraserhead.1977',
    })
    await waitFor(() => expect(calls('GET')).toHaveLength(2))
  })

  it('removes an alias', async () => {
    const user = userEvent.setup()
    render(<NcoreActivity />)
    await screen.findByText('A turné')

    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await user.click(screen.getByRole('button', { name: 'Remove alias' }))

    await waitFor(() => expect(calls('DELETE')).toHaveLength(1))
    expect(calls('DELETE')[0][0]).toBe('/api/aliases/4')
  })
})
