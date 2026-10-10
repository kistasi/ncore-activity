import type { Alias } from './types'

// Release names differ in separators ("Panic.Room.2002" vs "Panic Room 2002")
// and case, so compare on a normalized form.
export function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looselyEqual(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * Pair a hit-and-run name with one of the torrents: an exact normalized match
 * wins, then a substring match either way (nCore titles often drop or add a
 * tag), and only then a manual alias, which is looked up in both directions.
 */
export function matchTorrent<T extends { name: string }>(
  name: string,
  torrents: T[],
  aliases: Alias[]
): T | null {
  const needle = normalize(name)

  const exact = torrents.find((t) => normalize(t.name) === needle)
  if (exact) return exact

  const partial = torrents.find((t) => looselyEqual(normalize(t.name), needle))
  if (partial) return partial

  const alias = resolveAlias(needle, aliases)
  if (alias === null) return null

  return torrents.find((t) => looselyEqual(normalize(t.name), alias)) ?? null
}

function resolveAlias(needle: string, aliases: Alias[]): string | null {
  for (const a of aliases) {
    const ncore = normalize(a.ncoreName)
    const tx = normalize(a.transmissionName)
    if (ncore === needle) return tx
    if (tx === needle) return ncore
  }
  return null
}
