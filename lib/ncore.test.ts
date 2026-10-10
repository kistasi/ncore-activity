import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatRemaining, getHitAndRun, login, parseHitAndRun, resetSession } from './ncore'

const HNR_HTML = `
<html><body>
  <div class="hnr_torrents">
    <div class="hnr_tname"><a href="torrents.php?action=details&amp;id=1" title="Metropolis.1927.1080p">Metropolis...</a></div>
    <div class="hnr_tseed"> Seed </div>
    <div class="hnr_ttimespent">65ó 27p</div>
  </div>
  <div class="hnr_torrents">
    <div class="hnr_tname"><a href="https://ncore.pro/torrents.php?action=details&amp;id=2" title="Radírfej 720p">Radírfej</a></div>
  </div>
  <div class="hnr_torrents"><span>header row without a link</span></div>
</body></html>`

describe('formatRemaining', () => {
  it('rolls hours over into days', () => {
    expect(formatRemaining('65ó 27p')).toBe('2d 17h 27m')
  })

  it('reads days', () => {
    expect(formatRemaining('1n 2ó 3p')).toBe('1d 2h 3m')
  })

  it('omits leading zero units', () => {
    expect(formatRemaining('5p')).toBe('5m')
    expect(formatRemaining('3ó 0p')).toBe('3h 0m')
  })

  it('passes through text it cannot read', () => {
    expect(formatRemaining('-')).toBe('-')
  })
})

describe('parseHitAndRun', () => {
  it('extracts each torrent row and skips rows without a link', () => {
    expect(parseHitAndRun(HNR_HTML)).toEqual([
      {
        name: 'Metropolis.1927.1080p',
        status: 'Seed',
        remaining: '2d 17h 27m',
        link: 'https://ncore.pro/torrents.php?action=details&id=1',
      },
      {
        name: 'Radírfej 720p',
        status: 'N/A',
        remaining: 'N/A',
        link: 'https://ncore.pro/torrents.php?action=details&id=2',
      },
    ])
  })
})

describe('session handling', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    resetSession()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function cookieSent(call: number): string {
    const init = fetchMock.mock.calls[call][1] as RequestInit
    return (init.headers as Record<string, string>).Cookie
  }

  it('skips the login when the stored session is still valid', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }))
    expect(await login('user', 'pass')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the cookie set on the login redirect for later requests', async () => {
    fetchMock
      // Not logged in yet.
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/login.php' } }))
      // The login answers with a redirect carrying the session cookie.
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: '/index.php', 'Set-Cookie': 'PHPSESSID=abc; path=/; HttpOnly' },
        })
      )
      .mockResolvedValueOnce(new Response('home', { status: 200 }))
      // The confirming isLoggedIn check.
      .mockResolvedValueOnce(new Response('home', { status: 200 }))
      .mockResolvedValueOnce(new Response(HNR_HTML, { status: 200 }))

    expect(await login('user', 'pass')).toBe(true)
    const loginInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(loginInit.method).toBe('POST')
    expect(String(loginInit.body)).toContain('nev=user')
    expect(fetchMock.mock.calls[2][0]).toBe('https://ncore.pro/index.php')
    expect(cookieSent(2)).toContain('PHPSESSID=abc')

    expect(await getHitAndRun()).toHaveLength(2)
    expect(cookieSent(4)).toBe('nyelv=hu; stilus=default2; PHPSESSID=abc')
  })

  it('reports a failed login when the session still is not valid', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/login.php' } }))
      .mockResolvedValueOnce(new Response('login form again', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/login.php' } }))

    expect(await login('user', 'wrong')).toBe(false)
  })
})
