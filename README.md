# nCore Activity

Keeps an eye on nCore hit-and-run obligations: every torrent you still owe
seeding time on, matched against what Transmission is actually seeding.

The page shows two tables:

- **Hit-and-run entries** from nCore, with the remaining seed time and the
  matching Transmission torrent's state. A stopped torrent is flagged red. When
  the names are too different to match automatically (a Hungarian title against
  an English release name, say), pick the right torrent from the dropdown to
  save an alias.
- **In Transmission only**: torrents no entry matched, which can be removed
  (along with their data) one by one or in bulk.

## Configuration

| Variable | |
| --- | --- |
| `NCORE_USERNAME`, `NCORE_PASSWORD` | nCore login |
| `TRANSMISSION_RPC_URL` | e.g. `http://transmission:9091/transmission/rpc` |

Aliases are stored in `data/aliases.json`; mount a volume at `/app/data` to keep
them.

## Running with Docker

```bash
docker build -t ncore-activity .

docker run -d \
  --name ncore-activity \
  -p 3000:3000 \
  -e NCORE_USERNAME=... -e NCORE_PASSWORD=... \
  -e TRANSMISSION_RPC_URL=http://transmission:9091/transmission/rpc \
  -v ncore-activity-data:/app/data \
  ncore-activity
```

## Development

```bash
npm run dev     # http://localhost:3000
npm test        # vitest
npm run lint
```

## A note on the code

This project was written by [Claude Code](https://claude.com/claude-code), Anthropic's CLI coding agent.

## License

Released under the [MIT License](LICENSE).
