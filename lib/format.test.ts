import { describe, expect, it } from 'vitest'
import { entryStatus, formatSpeed, statusInfo } from './format'

describe('formatSpeed', () => {
  it('hides negligible rates', () => {
    expect(formatSpeed(null)).toBe('')
    expect(formatSpeed(99)).toBe('')
  })

  it('switches from KB/s to MB/s at a mebibyte', () => {
    expect(formatSpeed(2048)).toBe('2.0 KB/s')
    expect(formatSpeed(3 * 1024 * 1024)).toBe('3.00 MB/s')
  })
})

describe('statusInfo', () => {
  it('labels known statuses and falls back for unknown ones', () => {
    expect(statusInfo(4)).toEqual({ label: 'Downloading', tone: 'info.main' })
    expect(statusInfo(42).label).toBe('?')
  })
})

describe('entryStatus', () => {
  it('shows a dash for an unmatched entry', () => {
    expect(entryStatus(null, null).label).toBe('—')
  })

  it('shows the upload rate while seeding, if there is one', () => {
    expect(entryStatus(6, 2048)).toEqual({ label: '↑ 2.0 KB/s', tone: 'success.main' })
    expect(entryStatus(6, 0)).toEqual({ label: 'Seeding', tone: 'success.main' })
  })

  it('flags a stopped torrent', () => {
    expect(entryStatus(0, 0)).toEqual({ label: 'Stopped', tone: 'error.main' })
  })
})
