import { NextResponse } from 'next/server'
import { addAlias, DuplicateAliasError } from '@/lib/aliases-db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    ncoreName?: unknown
    transmissionName?: unknown
  } | null
  const ncoreName = typeof body?.ncoreName === 'string' ? body.ncoreName.trim() : ''
  const transmissionName =
    typeof body?.transmissionName === 'string' ? body.transmissionName.trim() : ''

  if (!ncoreName || !transmissionName) {
    return NextResponse.json(
      { error: 'Both `ncoreName` and `transmissionName` are required.' },
      { status: 400 }
    )
  }

  try {
    const alias = await addAlias(ncoreName, transmissionName)
    return NextResponse.json({ alias })
  } catch (err) {
    if (err instanceof DuplicateAliasError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    throw err
  }
}
