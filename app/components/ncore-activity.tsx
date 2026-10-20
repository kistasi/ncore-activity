'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ActivityEntry, ActivityResponse, UnmatchedTorrent } from '@/lib/types'
import { entryStatus, statusInfo } from '@/lib/format'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import LinkIcon from '@mui/icons-material/Link'

// Collapse a column to its content, for the narrow status/number columns.
const narrow = { width: '1px', whiteSpace: 'nowrap' } as const

// Torrent ids are only unique within one Transmission daemon.
const keyOf = (t: UnmatchedTorrent) => `${t.instance}:${t.id}`

function removalPrompt(torrents: UnmatchedTorrent[]): string {
  const subject = torrents.length === 1 ? 'torrent' : `${torrents.length} torrent(s)`
  const kept = torrents.filter((t) => t.instance === 'external').length
  if (kept === 0) return `Remove ${subject} from Transmission?`
  if (kept === torrents.length) return `Remove ${subject} from Transmission? Files on the external drive are kept.`
  return `Remove ${subject} from Transmission? Files of the ${kept} on the external drive are kept.`
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Request failed (${res.status}).`)
  }
}

async function fetchActivity(): Promise<ActivityResponse> {
  const res = await fetch('/api/activity')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`)
  return data as ActivityResponse
}

export default function NcoreActivity() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [unmatched, setUnmatched] = useState<UnmatchedTorrent[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  const showActivity = useCallback((activity: ActivityResponse) => {
    setEntries(activity.entries)
    setUnmatched(activity.unmatched)
    setError(null)
  }, [])

  // Load the hit-and-run list on mount.
  useEffect(() => {
    let active = true
    fetchActivity()
      .then((activity) => {
        if (active) showActivity(activity)
      })
      .catch((err: Error) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [showActivity])

  // Re-run the match after an alias change.
  const reload = async () => showActivity(await fetchActivity())

  // Following a torrent link counts as activity on nCore, so don't do it by
  // accident.
  const openLink = (event: React.MouseEvent, url: string) => {
    event.preventDefault()
    if (window.confirm('Open torrent page on nCore?')) {
      window.open(url, '_blank', 'noopener')
    }
  }

  const removeTorrents = async (torrents: UnmatchedTorrent[]) => {
    if (torrents.length === 0 || !window.confirm(removalPrompt(torrents))) return

    const keys = torrents.map(keyOf)
    setRemoving((r) => new Set([...r, ...keys]))
    try {
      await send('/api/torrents', 'DELETE', {
        torrents: torrents.map((t) => ({ instance: t.instance, id: t.id })),
      })
      setUnmatched((u) => u.filter((t) => !keys.includes(keyOf(t))))
      setSelected((s) => new Set([...s].filter((key) => !keys.includes(key))))
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setRemoving((r) => new Set([...r].filter((key) => !keys.includes(key))))
    }
  }

  const linkAlias = async (entry: ActivityEntry, transmissionName: string) => {
    if (!transmissionName) return
    try {
      await send('/api/aliases', 'POST', { ncoreName: entry.name, transmissionName })
      await reload()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  const unlinkAlias = async (entry: ActivityEntry) => {
    if (entry.aliasId === null || !window.confirm('Remove this alias?')) return
    try {
      await send(`/api/aliases/${entry.aliasId}`, 'DELETE')
      await reload()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  const toggleSelect = (key: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allSelected = unmatched.length > 0 && selected.size === unmatched.length
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(unmatched.map(keyOf)))
  }

  const bulkRemoving = selected.size > 0 && [...selected].every((key) => removing.has(key))

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Typography variant="h5" component="h1" color="primary" sx={{ mb: 3, fontWeight: 'bold' }}>
        nCore Activity
      </Typography>

      {loading ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
          <CircularProgress size={20} />
          <span>Fetching data…</span>
        </Stack>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <>
          {entries.length === 0 ? (
            <Typography color="text.secondary">No activity entries found.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={narrow}>#</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell sx={narrow}>Status</TableCell>
                    <TableCell sx={narrow}>Remaining</TableCell>
                    <TableCell sx={narrow}>Transmission</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e, i) => {
                    const tx = entryStatus(e.txStatus, e.txUpload)
                    return (
                      <TableRow key={`${i}-${e.name}`} hover>
                        <TableCell sx={{ ...narrow, color: 'text.disabled' }}>{i + 1}</TableCell>
                        <TableCell>
                          <Link href={e.link} onClick={(event) => openLink(event, e.link)}>
                            {e.name}
                          </Link>
                        </TableCell>
                        <TableCell sx={narrow}>{e.status}</TableCell>
                        <TableCell sx={narrow}>{e.remaining}</TableCell>
                        <TableCell sx={{ ...narrow, color: tx.tone }}>
                          {e.txStatus !== null ? (
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                              <span>{tx.label}</span>
                              {e.aliasId !== null && (
                                <>
                                  <Tooltip title="Matched via alias">
                                    <LinkIcon fontSize="small" color="warning" />
                                  </Tooltip>
                                  <Tooltip title="Remove alias">
                                    <IconButton
                                      size="small"
                                      aria-label="Remove alias"
                                      onClick={() => unlinkAlias(e)}
                                    >
                                      <CloseIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                            </Stack>
                          ) : (
                            <Select
                              size="small"
                              value=""
                              displayEmpty
                              aria-label={`Link ${e.name} to a Transmission torrent`}
                              onChange={(event) => linkAlias(e, event.target.value)}
                              sx={{ maxWidth: 200, fontSize: 'body2.fontSize' }}
                            >
                              <MenuItem value="">—</MenuItem>
                              {unmatched.map((t) => (
                                <MenuItem key={keyOf(t)} value={t.name}>
                                  {t.name}
                                </MenuItem>
                              ))}
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 5, mb: 1.5 }}>
            <Typography variant="h6" component="h2" color="primary">
              In Transmission only
            </Typography>
            {selected.size > 0 && (
              <Button
                size="small"
                variant="contained"
                color="error"
                disabled={bulkRemoving}
                startIcon={bulkRemoving ? <CircularProgress size={14} color="inherit" /> : <DeleteIcon />}
                onClick={() => removeTorrents(unmatched.filter((t) => selected.has(keyOf(t))))}
              >
                {bulkRemoving ? 'Deleting…' : `Delete selected (${selected.size})`}
              </Button>
            )}
          </Stack>

          {unmatched.length === 0 ? (
            <Typography color="text.secondary">No unmatched torrents.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={selected.size > 0 && !allSelected}
                        onChange={toggleSelectAll}
                        slotProps={{ input: { 'aria-label': 'Select all' } }}
                      />
                    </TableCell>
                    <TableCell sx={narrow}>#</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell sx={narrow}>Status</TableCell>
                    <TableCell sx={narrow} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {unmatched.map((t, i) => {
                    const status = statusInfo(t.txStatus)
                    const key = keyOf(t)
                    return (
                      <TableRow key={key} hover selected={selected.has(key)}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selected.has(key)}
                            onChange={() => toggleSelect(key)}
                            slotProps={{ input: { 'aria-label': `Select ${t.name}` } }}
                          />
                        </TableCell>
                        <TableCell sx={{ ...narrow, color: 'text.disabled' }}>{i + 1}</TableCell>
                        <TableCell sx={{ wordBreak: 'break-word' }}>
                          {t.name}
                          {t.instance === 'external' && (
                            <Tooltip title="On the external drive; removing keeps the files">
                              <Chip label="external" size="small" variant="outlined" sx={{ ml: 1 }} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...narrow, color: status.tone }}>{status.label}</TableCell>
                        <TableCell sx={narrow}>
                          <Tooltip title="Remove">
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Remove ${t.name}`}
                                disabled={removing.has(key)}
                                onClick={() => removeTorrents([t])}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Container>
  )
}
