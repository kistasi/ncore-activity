import { TX_SEEDING, TX_STATUS, TX_STOPPED } from './types'

/** Colors for torrent states, as MUI palette paths. */
export type Tone = 'text.disabled' | 'text.secondary' | 'success.main' | 'info.main' | 'warning.main' | 'error.main'

const STATUS_TONES: Tone[] = [
  'text.secondary',
  'warning.main',
  'warning.main',
  'info.main',
  'info.main',
  'success.main',
  'success.main',
]

/** Format a byte rate, or '' when it's too small to be worth showing. */
export function formatSpeed(bytesPerSecond: number | null): string {
  if (!bytesPerSecond || bytesPerSecond < 100) return ''
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`
}

/** Label and color for a Transmission status number. */
export function statusInfo(txStatus: number): { label: string; tone: Tone } {
  return {
    label: TX_STATUS[txStatus] ?? '?',
    tone: STATUS_TONES[txStatus] ?? 'text.secondary',
  }
}

/**
 * What the Transmission column shows for a hit-and-run entry. A stopped
 * torrent is the one that matters here (an obligation not being seeded), so it
 * is flagged red rather than the neutral color it gets elsewhere.
 */
export function entryStatus(txStatus: number | null, txUpload: number | null): {
  label: string
  tone: Tone
} {
  if (txStatus === null) return { label: '—', tone: 'text.disabled' }
  if (txStatus === TX_SEEDING) {
    const speed = formatSpeed(txUpload)
    return { label: speed ? `↑ ${speed}` : 'Seeding', tone: 'success.main' }
  }
  if (txStatus === TX_STOPPED) return { label: 'Stopped', tone: 'error.main' }
  return statusInfo(txStatus)
}
