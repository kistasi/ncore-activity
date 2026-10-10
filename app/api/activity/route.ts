import { NextResponse } from 'next/server'
import { getActivity } from '@/lib/activity'
import { NcoreError } from '@/lib/ncore'

// Live data from nCore and Transmission, so it must run per-request.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getActivity())
  } catch (err) {
    if (err instanceof NcoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
