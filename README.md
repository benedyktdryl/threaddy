# Threaddy

Local-first Bun app for indexing AI agent threads from Codex, Claude Code, and Cursor.

## Current milestone

This first implementation milestone focuses on a working CLI plus a minimal local web view:

- config bootstrap
- SQLite migrations
- provider discovery
- real indexing against local provider data
- basic diagnostics
- minimal HTML server

## Commands

Run directly with Bun:

```bash
bun run src/main.ts init
bun run src/main.ts scan
bun run src/main.ts reindex
bun run src/main.ts stats
bun run src/main.ts doctor
bun run src/main.ts serve
```

Package scripts are also available:

```bash
bun run init
bun run scan
bun run reindex
bun run stats
bun run doctor
bun run serve
```

## Config

Default config is written to:

```text
~/.config/agent-index/config.json
```

An example config lives in:

```text
agent-index.config.example.json
```

## Provider support

### Codex

- indexes rollout JSONL transcripts from `~/.codex/sessions`
- enriches metadata from `~/.codex/state_5.sqlite` when available

### Claude Code

- indexes transcript JSONL files from `~/.claude/projects`

### Cursor

- indexes composer metadata from `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- transcript bodies are intentionally partial in this milestone

## Building for production

Build a self-contained CLI binary using `bun build --compile`:

```bash
# Build for your current platform
bun run build

# Build for specific platforms
bun run build:macos-arm64
bun run build:macos-x64
bun run build:linux-x64
bun run build:linux-arm64
```

Binaries are placed in `dist/`. The compiled binary includes:
- All TypeScript/JavaScript code
- Embedded SQL migrations
- Embedded CSS assets
- React SSR server

**Note**: The semantic search embeddings use `@huggingface/transformers` which requires `onnxruntime-node` native bindings. In the compiled binary, semantic search will gracefully degrade if the native runtime is unavailable on the target system.

### GitHub Releases

Push a version tag to trigger automated cross-platform builds:

```bash
git tag v0.2.0
git push origin v0.2.0
```

This triggers `.github/workflows/release.yml` which:
- Builds binaries for macOS (arm64, x64) and Linux (x64, arm64)
- Generates SHA256 checksums
- Creates a GitHub Release with downloadable binaries

## Notes

- the database is created outside the repo by default at `~/.local/share/agent-index/index.sqlite`
- `scan --json` and `doctor --json` return the full raw payload
- the HTTP server is intentionally minimal in this milestone; the richer SSR UI comes next
