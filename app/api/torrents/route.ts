import { NextResponse } from 'next/server'
import { removeTorrents, TransmissionError } from '@/lib/transmission'

export const dynamic = 'force-dynamic'

// Remove torrents (and their data) from Transmission. Takes a list so the
// page's single and bulk delete share one endpoint.
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids : []

  if (ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json(
      { error: 'Request must include `ids`, a non-empty list of positive torrent ids.' },
      { status: 400 }
    )
  }

  try {
    await removeTorrents(ids)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof TransmissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
