import { parse } from 'node-html-parser'
import type { HitAndRunEntry } from './types'

const BASE_URL = 'https://ncore.pro'

/** Error carrying an HTTP status, so route handlers can respond appropriately. */
export class NcoreError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'NcoreError'
    this.status = status
  }
}

// nCore turns away requests that don't look like they came from a browser.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  Priority: 'u=0, i',
}

// The session cookie jar, kept in memory for the life of the server so each
// page load reuses the login instead of signing in again. The language and
// style cookies pin the Hungarian default layout the parser expects.
const INITIAL_COOKIES: [string, string][] = [
  ['nyelv', 'hu'],
  ['stilus', 'default2'],
]
const cookies = new Map<string, string>(INITIAL_COOKIES)

/** Forget the session; only exported for tests. */
export function resetSession(): void {
  cookies.clear()
  for (const [name, value] of INITIAL_COOKIES) cookies.set(name, value)
}

function storeCookies(res: Response): void {
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(';')
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    // An expired or "deleted" cookie is how nCore logs a session out.
    if (value === '' || value === 'deleted') cookies.delete(name)
    else cookies.set(name, value)
  }
}

function cookieHeader(): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

// Redirects are followed by hand: fetch's own redirect handling hides the
// intermediate responses, and the login's Set-Cookie arrives on a 302.
async function ncoreFetch(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  followRedirects = true
): Promise<Response> {
  let current = url
  let method = init.method ?? 'GET'
  let body = init.body

  for (let hop = 0; hop < 10; hop++) {
    let res: Response
    try {
      res = await fetch(current, {
        method,
        body,
        redirect: 'manual',
        headers: { ...BROWSER_HEADERS, ...init.headers, Cookie: cookieHeader() },
      })
    } catch (err) {
      throw new NcoreError(`nCore request failed: ${(err as Error).message}`)
    }
    storeCookies(res)

    const location = res.headers.get('Location')
    if (!followRedirects || res.status < 300 || res.status >= 400 || !location) {
      return res
    }
    current = new URL(location, current).toString()
    method = 'GET'
    body = undefined
  }
  throw new NcoreError('Too many redirects from nCore.')
}

async function isLoggedIn(): Promise<boolean> {
  // A logged-out index.php redirects to the login page.
  const res = await ncoreFetch(`${BASE_URL}/index.php`, {}, false)
  return res.status === 200
}

/** Sign in, unless the stored session is still valid. */
export async function login(username: string, password: string): Promise<boolean> {
  if (await isLoggedIn()) return true

  const res = await ncoreFetch(`${BASE_URL}/login.php`, {
    method: 'POST',
    body: new URLSearchParams({
      set_lang: 'hu',
      submitted: '1',
      nev: username,
      pass: password,
    }).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/login.php`,
    },
  })
  if (!res.ok) return false
  // A failed login just re-renders the login form, so ask again rather than
  // guess from the response.
  return isLoggedIn()
}

/** Fetch the hit-and-run list, ordered by least time remaining first. */
export async function getHitAndRun(): Promise<HitAndRunEntry[]> {
  const query = new URLSearchParams({ order_by: 'remaining', o: 'asc' })
  const res = await ncoreFetch(`${BASE_URL}/hitnrun.php?${query}`, {
    headers: { Referer: `${BASE_URL}/index.php` },
  })
  const html = await res.text()
  if (!res.ok || !html) {
    throw new NcoreError(`Unexpected response from hitnrun.php (HTTP ${res.status}).`)
  }
  return parseHitAndRun(html)
}

export function parseHitAndRun(html: string): HitAndRunEntry[] {
  const root = parse(html)
  const entries: HitAndRunEntry[] = []

  for (const row of root.querySelectorAll('div.hnr_torrents')) {
    const nameNode = row.querySelector('a[title]')
    if (!nameNode) continue

    const href = (nameNode.getAttribute('href') ?? '').trim()
    const status = row.querySelector('.hnr_tseed')
    const time = row.querySelector('.hnr_ttimespent')

    entries.push({
      name: (nameNode.getAttribute('title') ?? '').trim(),
      status: status ? status.textContent.trim() : 'N/A',
      remaining: time ? formatRemaining(time.textContent.trim()) : 'N/A',
      link: href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\/+/, '')}`,
    })
  }

  return entries
}

/** Converts an nCore "65ó 27p" style duration into "2d 17h 27m". */
export function formatRemaining(raw: string): string {
  const days = Number(/(\d+)\s*n\b/u.exec(raw)?.[1] ?? 0)
  const hours = Number(/(\d+)\s*ó/u.exec(raw)?.[1] ?? 0)
  const minutes = Number(/(\d+)\s*p\b/u.exec(raw)?.[1] ?? 0)

  if (days === 0 && hours === 0 && minutes === 0) return raw

  const total = days * 24 * 60 + hours * 60 + minutes
  const d = Math.floor(total / (24 * 60))
  const h = Math.floor((total % (24 * 60)) / 60)
  const m = total % 60

  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (d > 0 || h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}
