import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// aliases-db computes its DB path from process.cwd() at import time, so we
// point cwd at a throwaway temp dir and import the module fresh for each test.
let tmpDir: string
let db: typeof import('./aliases-db')

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aliases-db-'))
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  vi.resetModules()
  db = await import('./aliases-db')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('aliases-db', () => {
  it('returns an empty list when the file does not exist', async () => {
    expect(await db.getAliases()).toEqual([])
  })

  it('adds aliases with increasing ids', async () => {
    const a = await db.addAlias('A turné', 'This Is Spinal Tap (1984).avi')
    const b = await db.addAlias('Radírfej 720p', 'Eraserhead.1977.720p')
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(await db.getAliases()).toEqual([a, b])
  })

  it('does not reuse the id of the newest alias after a removal', async () => {
    await db.addAlias('a', 'x')
    const b = await db.addAlias('b', 'y')
    await db.removeAlias(1)
    expect((await db.addAlias('c', 'z')).id).toBe(b.id + 1)
  })

  it('rejects a second alias for the same nCore name', async () => {
    await db.addAlias('A turné', 'x')
    await expect(db.addAlias('A turné', 'y')).rejects.toBeInstanceOf(db.DuplicateAliasError)
    expect(await db.getAliases()).toHaveLength(1)
  })

  it('removes an alias and reports whether it existed', async () => {
    const a = await db.addAlias('a', 'x')
    expect(await db.removeAlias(a.id)).toBe(true)
    expect(await db.removeAlias(a.id)).toBe(false)
    expect(await db.getAliases()).toEqual([])
  })

  it('persists to data/aliases.json', async () => {
    await db.addAlias('a', 'x')
    const raw = await fs.readFile(path.join(tmpDir, 'data', 'aliases.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual([{ id: 1, ncoreName: 'a', transmissionName: 'x' }])
  })
})
