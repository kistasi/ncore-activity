import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Alias } from './types'

// JSON file database. Lives at <project root>/data/aliases.json.
const DB_PATH = path.join(process.cwd(), 'data', 'aliases.json')

/** Raised when an alias for the given nCore name already exists. */
export class DuplicateAliasError extends Error {
  constructor(ncoreName: string) {
    super(`An alias for "${ncoreName}" already exists.`)
    this.name = 'DuplicateAliasError'
  }
}

async function readAll(): Promise<Alias[]> {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8')
    return JSON.parse(raw) as Alias[]
  } catch (err) {
    // A missing file just means an empty database.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeAll(aliases: Alias[]): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true })
  await fs.writeFile(DB_PATH, JSON.stringify(aliases, null, 2) + '\n', 'utf8')
}

/** Return every stored alias, oldest first. */
export async function getAliases(): Promise<Alias[]> {
  return readAll()
}

/**
 * Persist a new alias. nCore names are unique, since one hit-and-run entry
 * can only pair with one torrent.
 */
export async function addAlias(ncoreName: string, transmissionName: string): Promise<Alias> {
  const existing = await readAll()
  if (existing.some((a) => a.ncoreName === ncoreName)) {
    throw new DuplicateAliasError(ncoreName)
  }
  const alias = {
    id: Math.max(0, ...existing.map((a) => a.id)) + 1,
    ncoreName,
    transmissionName,
  }
  await writeAll([...existing, alias])
  return alias
}

/** Remove an alias by id. Returns whether one was removed. */
export async function removeAlias(id: number): Promise<boolean> {
  const existing = await readAll()
  const updated = existing.filter((a) => a.id !== id)
  if (updated.length === existing.length) return false
  await writeAll(updated)
  return true
}
