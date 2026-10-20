import { NextResponse } from 'next/server'
import { removeTorrents, TransmissionError } from '@/lib/transmission'
import type { TorrentRef } from '@/lib/types'

export const dynamic = 'force-dynamic'

function isTorrentRef(value: unknown): value is TorrentRef {
  const ref = value as Partial<TorrentRef> | null
  return (
    (ref?.instance === 'main' || ref?.instance === 'external') &&
    Number.isInteger(ref.id) &&
    (ref.id as number) > 0
  )
}

// Remove torrents from Transmission. Takes a list so the page's single and bulk
// delete share one endpoint. Whether their data goes too depends on which
// daemon they are in, and is up to the server.
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { torrents?: unknown } | null
  const torrents = Array.isArray(body?.torrents) ? body.torrents : []

  if (torrents.length === 0 || !torrents.every(isTorrentRef)) {
    return NextResponse.json(
      {
        error:
          'Request must include `torrents`, a non-empty list of `{ instance, id }` with instance ' +
          '"main" or "external" and a positive torrent id.',
      },
      { status: 400 }
    )
  }

  try {
    await removeTorrents(torrents)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof TransmissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
