import { describe, expect, it } from 'vitest'
import { matchTorrent, normalize } from './torrent-matcher'
import type { Alias } from './types'

const torrents = [
  { id: 1, name: 'Panic.Room.2002.Open.Matte.1080p.WEB-DL.DD+5.1.HuN-TRiNiTY' },
  { id: 2, name: 'Eraserhead.1977.720p.BluRay.FLAC.2.0.x264-DON' },
  { id: 3, name: 'Metropolis 1927 1080p' },
]

function alias(ncoreName: string, transmissionName: string): Alias {
  return { id: 1, ncoreName, transmissionName }
}

describe('normalize', () => {
  it('lowercases and collapses separators and whitespace', () => {
    expect(normalize('  The.Royal_Tenenbaums--2001   720p ')).toBe('the royal tenenbaums 2001 720p')
  })
})

describe('matchTorrent', () => {
  it('matches names that differ only in separators and case', () => {
    expect(matchTorrent('metropolis.1927.1080P', torrents, [])?.id).toBe(3)
  })

  it('matches when one name contains the other', () => {
    expect(matchTorrent('Metropolis.1927', torrents, [])?.id).toBe(3)
    expect(matchTorrent('Metropolis.1927.1080p.BluRay.DTS', torrents, [])?.id).toBe(3)
  })

  it('prefers an exact match over an earlier partial one', () => {
    const list = [
      { id: 1, name: 'Alien 1979 Directors Cut' },
      { id: 2, name: 'Alien 1979' },
    ]
    expect(matchTorrent('Alien.1979', list, [])?.id).toBe(2)
  })

  it('falls back to an alias from the nCore name', () => {
    const aliases = [alias('Radírfej 720p', 'Eraserhead.1977.720p.BluRay.FLAC.2.0.x264-DON')]
    expect(matchTorrent('Radírfej 720p', torrents, aliases)?.id).toBe(2)
  })

  it('resolves an alias in the other direction too', () => {
    const aliases = [alias('Pánikszoba', 'Some.Other.Name')]
    const list = [{ id: 9, name: 'Pánikszoba 1080p' }]
    expect(matchTorrent('Some Other Name', list, aliases)?.id).toBe(9)
  })

  it('returns null when nothing matches', () => {
    expect(matchTorrent('Radírfej 720p', torrents, [])).toBeNull()
    expect(matchTorrent('Radírfej 720p', torrents, [alias('Radírfej 720p', 'Not There')])).toBeNull()
  })
})
