# Threaddy v1 Design

Date: 2026-04-21
Status: Approved in conversation, written for implementation

## Summary

Threaddy is a 100% local, Bun-based web app that indexes AI agent threads from Codex, Claude Code, and Cursor into a local SQLite database, then serves a fast SSR UI for browsing, filtering, searching, and diagnosing those threads.

The app is explicitly local-first:

- no cloud sync
- no telemetry
- no required remote services
- localhost-only by default

The first implementation pass targets the full v1 sweep from `AGENT_INDEX_PRD.md`, while isolating provider-specific assumptions behind adapters so iteration remains cheap.

## Product Scope

### In scope

- Bun + TypeScript project
- local SQLite database with migrations
- Bun HTTP server
- SSR React UI
- Tailwind-based styling
- compact app shell with header, sidebar, list view, and detail view
- provider adapter system for Codex, Claude Code, and Cursor
- incremental reindex pipeline
- diagnostics pages
- CLI commands: `serve`, `reindex`, `scan`, `doctor`, `stats`, `init`
- local config file with defaults and overrides

### Out of scope for v1

- editing provider conversations
- writing back into provider stores
- background daemon as a requirement
- semantic search
- mandatory live watch mode
- full reverse-engineering of opaque Cursor transcript internals

## Architecture

Threaddy uses a simple three-layer design.

### 1. Core platform

Responsibilities:

- config loading and validation
- logging
- SQLite connection and migrations
- repositories
- CLI bootstrap
- common domain types

Rules:

- repositories stay thin
- migrations are SQL files, not ad hoc table creation
- SQLite is opened in WAL mode

### 2. Ingestion layer

Responsibilities:

- provider discovery
- candidate enumeration
- file-change detection
- parsing
- normalization
- persistence
- index-run accounting
- parse issue recording

Rules:

- adapters are isolated from the UI
- malformed provider files never stop the whole index run
- previous good indexed rows remain if reparsing fails

### 3. Read layer

Responsibilities:

- Bun HTTP server
- route handlers
- SSR React rendering
- HTML pages
- action endpoints
- minimal JSON utility endpoints

Rules:

- server-rendered pages first
- no SPA router
- tiny client-side JS only for minor enhancements

## Runtime Design

- `bun` runs both CLI and local web server
- `serve` starts one local HTTP process
- startup opens DB, applies migrations, and renders immediately from SQLite
- startup does not trigger a full scan
- reindex is explicit from CLI or POST action

## Config Design

### Config sources

1. built-in defaults
2. user config in `~/.config/agent-index/config.json`
3. cwd config for development override
4. env overrides for a narrow set of runtime values

### Effective config fields

- DB path
- host / port
- provider enablement
- provider roots
- exclude globs
- indexing flags
- watch flags
- debug logging

If no config exists, `init` creates a default file.

## Storage Design

### SQLite tables

- `providers`
- `source_roots`
- `threads`
- `messages`
- `thread_sources`
- `index_runs`
- `parse_issues`
- `fts_threads`
- optional `fts_messages`

### Threads table intent

Stores the denormalized read model for list pages:

- provider
- title
- project
- repo path
- timestamps
- counts
- status
- derived snippets
- capabilities
- flags

### Messages table intent

Stores timeline entries when a provider exposes them.

Additional field beyond the PRD:

- `kind`: `chat | tool_call | tool_result | reasoning | event`

This allows Codex and Claude Code event streams to be represented faithfully without flattening all records into fake chat bubbles.

### Thread sources table intent

Maps one indexed thread to one or more provider source artifacts.

This is needed because some providers use one canonical transcript file plus sidecar metadata files or SQLite rows.

### Capabilities and flags

`threads.capabilities_json` records what the adapter was able to recover, for example:

```json
{"messages":true,"messageSearch":true,"toolCalls":true}
```

`threads.thread_flags_json` records derived behavior and risk flags, for example:

```json
{"hasToolCalls":true,"hasSubagents":false,"hasOpaqueTranscript":false}
```

## Incremental Indexing Design

### Startup

1. load config
2. open DB
3. apply migrations
4. render UI from current DB contents

### Reindex

1. discover roots per enabled provider
2. enumerate candidate sources
3. compare `(path, size, mtimeMs)` to known records
4. compute content hash only when candidate looks changed
5. parse changed or new sources
6. normalize to shared bundles
7. upsert threads, messages, thread sources, issues
8. mark disappeared sources as orphaned
9. persist index run summary

### Failure behavior

- one broken source creates a parse issue, not a fatal run
- one broken adapter does not stop other adapters
- previous successful rows remain until replacement succeeds

## Provider Design

### Shared adapter contract

Each provider adapter exposes:

- discovery
- candidate listing
- reparsing decision support
- parsing
- normalization
- optional health check

Each normalized thread bundle may contain:

- full messages
- partial messages
- no messages, only metadata

Each bundle must also carry:

- source references used
- parse issues
- capability flags
- final thread status

### Codex adapter

Canonical transcript source:

- `~/.codex/sessions/**/rollout-*.jsonl`

Metadata enrichment:

- `~/.codex/state_*.sqlite`
- `~/.codex/session_index.jsonl`

Important notes:

- rollout files are append-only event streams
- event/message/tool records must be normalized selectively
- encrypted reasoning content is opaque and should not be indexed verbatim
- `auth.json` and shell snapshots are excluded from indexing

Expected fidelity:

- rich thread metadata
- rich message timeline
- tool-call visibility

### Claude Code adapter

Canonical transcript source:

- `~/.claude/projects/**/*.jsonl`

Metadata enrichment:

- `~/.claude/history.jsonl`
- `~/.claude/sessions/*.json`

Important notes:

- project JSONL mixes `user`, `assistant`, `attachment`, `ai-title`, and other event types
- `message.content` is polymorphic
- tool results may appear both in message content and sidecar result fields
- memory markdown files are not canonical transcript sources

Expected fidelity:

- rich thread metadata
- rich message timeline
- tool-call visibility

### Cursor adapter

Canonical metadata source for v1:

- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`

Workspace mapping:

- `~/Library/Application Support/Cursor/User/workspaceStorage/*/workspace.json`

Important notes:

- composer headers and composer data are available
- the apparent transcript body is opaque/versioned
- text blobs exist, but are not reliable user/assistant transcript sources
- workspace IDs require mapping back to folders

Expected fidelity in v1:

- strong thread/composer metadata
- partial or absent message timeline
- explicit capability flag showing partial transcript support

Threaddy will treat Cursor as a first-class but partial adapter in v1 instead of pretending transcript recovery is complete.

## UI Design

### Shell

Desktop-first workbench layout:

- top header
- persistent left sidebar
- main content pane

Design goals:

- compact density
- muted chrome
- readable hierarchy
- no card-heavy admin-template look

### Routes

- `/` redirects to `/threads`
- `/threads`
- `/threads/:threadId`
- `/diagnostics/issues`
- `/diagnostics/roots`
- `/diagnostics/runs`
- `/settings`
- `/api/health`
- `/api/stats`

### Header behavior

- app title
- global search field
- refresh index action
- last indexed status
- stats/settings links

### Sidebar behavior

Groups:

- All Threads
- Providers
- Projects
- Diagnostics

### Thread list page

Dense table with:

- title
- provider
- project
- repo/path
- updated
- messages
- tools
- status

Supports:

- query-param filtering
- query-param sorting
- query-param pagination
- row click to detail

### Thread detail page

Sections:

1. metadata header
2. summary stats
3. source artifacts
4. message timeline when available
5. parse issues

If a provider exposes only partial transcript support, the page must say so explicitly instead of rendering misleading empty sections.

### Diagnostics pages

- parse issues
- source roots
- index runs

Diagnostics are first-class product features, not hidden debug screens.

## Action Design

### POST `/actions/reindex`

- runs incremental reindex
- stores result in `index_runs`
- redirects back with flash status

### POST `/actions/reindex/provider/:providerId`

- same as above, scoped to one provider

### POST `/actions/doctor`

- runs config and storage checks
- records/report diagnostics
- redirects to diagnostics view

No websocket or SSE progress stream in the first pass.

## CLI Design

Commands:

- `serve`
- `reindex`
- `scan`
- `doctor`
- `stats`
- `init`

All CLI commands must share the same config, DB, and provider registry codepaths used by the web app.

## Search Design

### Default

Search the thread-level read model:

- title
- project name
- repo path
- derived snippets

### Optional

Message-level FTS behind config flag:

- off by default
- enabled only when the user opts in

## Error Handling

Principles:

- fail soft
- preserve last known good indexed data
- isolate provider failures
- surface actionable diagnostics

UI behavior:

- show warning state when diagnostics exist
- keep current index visible if refresh fails

## Testing Design

The first pass includes:

- parser/helper unit tests
- fixture-driven adapter tests
- migration smoke test
- repository/query smoke test

The first pass does not require full browser E2E coverage.

## Implementation Notes

- keep adapters isolated and testable
- keep client JS tiny
- prefer vertical slices over speculative abstractions
- document provider assumptions in README
- keep Cursor limitations explicit

## Delivery Intent

The first code pass should produce a runnable MVP that is genuinely useful:

- it indexes real local data
- it serves a working UI
- it exposes diagnostics
- it handles partial provider support honestly

It does not need to perfectly decode every provider-specific edge case on day one.
