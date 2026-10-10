import { NextResponse } from 'next/server'
import { removeAlias } from '@/lib/aliases-db'

export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, ctx: RouteContext<'/api/aliases/[id]'>) {
  const { id: rawId } = await ctx.params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid alias id.' }, { status: 400 })
  }

  if (!(await removeAlias(id))) {
    return NextResponse.json({ error: 'Alias not found.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
