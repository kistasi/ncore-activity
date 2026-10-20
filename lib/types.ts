// Shared, low-dependency types safe to import from both server and client code.

/** A row of nCore's hit-and-run page. */
export type HitAndRunEntry = {
  name: string
  status: string
  remaining: string
  link: string
}

/**
 * Which Transmission daemon a torrent lives in: the main one, or the optional
 * external one whose downloads are kept when a torrent is removed.
 */
export type TxInstance = 'main' | 'external'

/** Identifies a torrent; ids are only unique within one daemon. */
export type TorrentRef = {
  instance: TxInstance
  id: number
}

/** The subset of Transmission's torrent-get fields this app asks for. */
export type TransmissionTorrent = {
  instance: TxInstance
  id: number
  name: string
  status: number
  rateUpload: number
  rateDownload: number
}

/**
 * A manual pairing for names the matcher can't line up on its own (e.g. a
 * Hungarian title on nCore against the English release name in Transmission).
 */
export type Alias = {
  id: number
  ncoreName: string
  transmissionName: string
}

/** A hit-and-run entry joined with its Transmission torrent, if one matched. */
export type ActivityEntry = HitAndRunEntry & {
  txStatus: number | null
  txUpload: number | null
  aliasId: number | null
}

/** A Transmission torrent no hit-and-run entry matched. */
export type UnmatchedTorrent = {
  instance: TxInstance
  id: number
  name: string
  txStatus: number
  txUpload: number
  txDownload: number
}

export type ActivityResponse = {
  entries: ActivityEntry[]
  unmatched: UnmatchedTorrent[]
}

/** Labels for Transmission's numeric torrent status, indexed 0–6. */
export const TX_STATUS = [
  'Stopped',
  'Queued',
  'Checking',
  'Queued',
  'Downloading',
  'Queued',
  'Seeding',
] as const

export const TX_STOPPED = 0
export const TX_SEEDING = 6
