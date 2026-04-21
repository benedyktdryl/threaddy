# AGENT THREAD INDEXER
## Product Requirements Document + Technical Spec
### Version 1.0

---

# 1. Product Summary

Build a **100% local, Bun-based desktop-style web app** that scans local storage for AI agent conversation/session/thread data from tools such as:

- Claude Code
- Codex
- Cursor
- future providers via adapters

The app should:

- index conversations into a **local SQLite database**
- normalize thread metadata across providers
- render a **fast local HTML UI**
- support **very fast cold start**
- support **very fast re-index**
- optionally support lightweight file watching later
- never require cloud sync, third-party backend, analytics, or remote API

This is **not** “one tool to rule them all.”
This is a **local observability/indexing layer** over multiple existing agent tools.

The user goal is simple:

> “Show me all my agent threads in one place, grouped, searchable, filterable, and pleasant to browse.”

---

# 2. Product Goals

## Primary goals

1. **Local-first**
   - all data remains on disk
   - no remote calls required for normal operation
   - no telemetry

2. **Fast**
   - startup should feel instant
   - UI should load from SQLite index, not by rescanning raw files every time
   - manual re-index should be quick and incremental where possible

3. **Reliable**
   - adapter failures for one provider must not break the whole app
   - malformed files should be skipped and logged
   - partial indexing must still produce a usable UI

4. **Readable**
   - compact but polished UI
   - clear sidebar/tree navigation
   - useful table views
   - thread detail page with source metadata and message preview

5. **Extensible**
   - provider adapters should be pluggable
   - schema must support future tools without migrations every week

## Non-goals for v1

- writing back into provider sessions
- editing conversations
- syncing across machines
- semantic embeddings/vector search
- full-text indexing of every token from every message if it hurts speed too much
- live two-way hydration complexity
- auth / login / multi-user
- background daemon mandatory for core functionality

---

# 3. Product Principles

1. **Cold start should read SQLite, not the world**
2. **Indexing is explicit and observable**
3. **HTML first, JS second**
4. **Server-rendered pages with tiny islands for interaction**
5. **Adapters are dirty; UI and DB are clean**
6. **Failure-tolerant ingestion beats fragile “perfect parsing”**
7. **Incremental re-index whenever possible**
8. **No fancy architecture unless it materially improves speed**

---

# 4. User Stories

## Core

- As a user, I want to see **all threads from all supported AI tools** in one place.
- As a user, I want to filter by **provider**, **project**, **repo/path**, **date**, **status**, and **tags**.
- As a user, I want to search by **thread title**, **path**, and optionally **message text/snippet**.
- As a user, I want to open a thread detail page and inspect:
  - title
  - provider
  - path/repo
  - timestamps
  - stats
  - message preview
  - source file location
- As a user, I want a **Refresh Index** button in the UI that triggers a local re-index and reloads the page.
- As a user, I want indexing problems surfaced clearly, not silently hidden.

## Secondary

- As a user, I want to see which folders/providers were discovered automatically.
- As a user, I want to exclude noisy folders or providers.
- As a user, I want to know if an indexed thread is stale, missing source, duplicated, or partially parsed.
- As a user, I want a small config file so I can override paths.

---

# 5. Proposed Stack

## Runtime / package / build

- **Bun**
- TypeScript
- single repo
- local execution first
- optional compile to Bun executable later

## Storage

- SQLite
- Bun native SQLite API preferred over additional native dependencies

## Server/UI

- Bun HTTP server
- React for rendering
- server-side rendered HTML
- small client-side JS only where needed
- Tailwind CSS
- shadcn/ui components
- TanStack Table for data table behavior
- optional TanStack Virtual if row counts get large
- lucide-react icons

## Why this stack

- Bun gives one runtime/package/build surface
- SQLite gives fast local indexed reads
- SSR HTML gives immediate page rendering
- shadcn gives fast UI assembly without locking into a giant abstraction
- tiny progressive enhancement keeps local app snappy

---

# 6. App Modes

## Mode A — default recommended

**Indexed local web app**
- command starts local HTTP server on localhost
- loads from SQLite immediately
- serves HTML UI
- refresh button triggers re-index then page reload

This is the main product.

## Mode B — one-shot CLI report

Useful for scripting:

- `agent-index scan`
- `agent-index serve`
- `agent-index reindex`
- `agent-index doctor`
- `agent-index stats`

## Mode C — watch mode (optional, not default)

- file system watch for known roots
- debounce changes
- trigger partial reindex
- off by default because it can be noisy and more fragile

---

# 7. High-Level Architecture

## Overview

```text
Raw provider files/folders
  -> provider discovery
  -> provider adapters
  -> normalization layer
  -> SQLite index
  -> query service
  -> SSR UI
  -> optional tiny client actions
```

## Main modules

1. **Config**
2. **Path discovery**
3. **Provider adapter registry**
4. **Indexer / ingestion pipeline**
5. **SQLite repository layer**
6. **Query service**
7. **Web server**
8. **SSR React UI**
9. **Action endpoints**
10. **Diagnostics/logging**

---

# 8. Supported Providers in v1

## Required in v1

### Codex
Adapter reads known Codex local session/thread artifacts.

### Claude Code
Adapter reads local project/session artifacts.

### Cursor
Adapter probes multiple possible local storage conventions because provider storage can change across versions.

## Optional in v1.1+

- Claude export import
- OpenCode
- Aider
- Gemini CLI tools
- custom JSON import
- generic “folder parser” contracts

---

# 9. Discovery Strategy

## Requirements

The app must not hardcode one path per provider and assume success.

Each provider needs:

- default path probes
- OS-specific probes
- config overrides
- path existence checks
- discovery diagnostics

## Discovery order

1. user-configured paths
2. known default paths
3. known alternate paths
4. environment-variable overrides
5. provider disabled if nothing valid found

## Discovery output

For each provider:

- provider name
- discovered roots
- selected roots
- skipped roots
- reason for skip
- file counts estimate

---

# 10. Normalized Domain Model

## Entity: Provider

```ts
type Provider = {
  id: string;           // "codex" | "claude-code" | "cursor" | custom
  name: string;
  version?: string;
  isEnabled: boolean;
}
```

## Entity: SourceRoot

```ts
type SourceRoot = {
  id: string;
  providerId: string;
  path: string;
  status: "ok" | "missing" | "error" | "disabled";
  lastScannedAt?: string;
  notes?: string;
}
```

## Entity: Thread

```ts
type Thread = {
  id: string;                    // internal stable UUID
  providerId: string;
  providerThreadId?: string;     // if provider has one
  sourceRootId?: string;

  title: string | null;
  projectName: string | null;
  repoPath: string | null;
  cwd: string | null;

  createdAt: string | null;
  updatedAt: string | null;

  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  errorCount: number;

  status: "ok" | "partial" | "error" | "orphaned";
  isArchived: boolean;

  sourcePath: string;
  sourceHash: string;            // content hash or file identity hash
  parserVersion: number;

  summary: string | null;        // derived, not AI-generated
  firstUserSnippet: string | null;
  lastAssistantSnippet: string | null;

  tagsJson: string | null;       // JSON array
}
```

## Entity: Message

```ts
type Message = {
  id: string;
  threadId: string;
  ordinal: number;

  role: "system" | "user" | "assistant" | "tool" | "other";
  createdAt: string | null;

  contentText: string | null;
  contentPreview: string | null;

  toolName: string | null;
  toolCallId: string | null;

  sourceMessageId: string | null;
  sourcePath: string;
  sourceOffset: number | null;

  parseStatus: "ok" | "partial" | "error";
}
```

## Entity: IndexRun

```ts
type IndexRun = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "ok" | "partial" | "failed";

  providersJson: string;
  rootsScanned: number;
  filesSeen: number;
  filesChanged: number;
  threadsUpserted: number;
  messagesUpserted: number;
  errors: number;

  notes: string | null;
}
```

## Entity: ParseIssue

```ts
type ParseIssue = {
  id: string;
  providerId: string;
  sourcePath: string;
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
}
```

---

# 11. SQLite Schema

## Tables

- `providers`
- `source_roots`
- `threads`
- `messages`
- `index_runs`
- `parse_issues`
- `thread_tags` (optional normalized form)
- `fts_threads` (optional)
- `fts_messages` (optional, maybe off by default)

## Indexes

### threads
- `(provider_id, updated_at desc)`
- `(provider_id, project_name)`
- `(repo_path)`
- `(status)`
- `(source_path unique)`
- `(source_hash)`

### messages
- `(thread_id, ordinal)`
- `(role)`
- `(created_at)`

### parse_issues
- `(provider_id, severity)`
- `(source_path)`

## FTS strategy

### v1 default
Use FTS only for:
- thread title
- project name
- repo path
- summary
- first/last snippet

### v1 optional flag
Enable message-level FTS only if user opts in:
- can be larger and slower to maintain
- worth making configurable

---

# 12. Indexing Strategy

## Core rule

The app should **not** fully reparse everything on every launch.

## On startup

1. open DB
2. run migrations
3. load cached metadata
4. serve UI immediately

## On manual re-index

1. discover roots
2. enumerate candidate files
3. compare file stat + hash strategy
4. only parse changed/new files
5. mark missing threads as orphaned or deleted
6. commit in batches
7. write index run summary
8. redirect/reload UI

## File identity strategy

Use a combination of:
- source path
- file size
- mtime
- cheap content hash when needed

Suggested algorithm:
- first pass: path + mtime + size
- if changed: compute fast hash
- if unchanged: skip parse

## Parsing batches

- process provider by provider
- commit every N threads/messages
- avoid giant long-lived transactions on very large datasets
- use WAL mode for SQLite

## Integrity behavior

If one file fails:
- record parse issue
- continue
- keep previous indexed version unless source is gone

---

# 13. Performance Targets

## Target feel, not benchmark theater

### Cold start
- app visible in browser fast enough to feel immediate
- no forced scan before first render

### Re-index
- small incremental re-index should feel near-instant
- medium re-index should show progress
- very large first-time index can take longer, but UI should expose progress cleanly

## Performance techniques

1. load list pages from SQLite only
2. avoid hydrating entire page
3. use pagination or virtualization
4. store derived snippets at index time
5. batch inserts
6. use prepared statements
7. use WAL
8. defer expensive counts if needed
9. make message FTS optional

---

# 14. UI / UX Specification

## Design direction

A compact local admin/workbench feel.
Not “consumer shiny,” not ugly terminal cosplay.

Inspiration:
- local devtools
- source control clients
- data browser
- log explorer
- ops dashboard
- left-nav + content + utility header

## Layout

```text
+---------------------------------------------------------------+
| Header: app title | search | refresh index | stats | settings |
+----------------------+----------------------------------------+
| Sidebar              | Main content                           |
|----------------------|----------------------------------------|
| Providers tree       | Toolbar / filters                      |
| Projects tree        | Data table / thread list               |
| Saved filters        |                                        |
| Diagnostics          |                                        |
+----------------------+----------------------------------------+
```

## Header

Components:
- app title
- global search field
- refresh index button
- last indexed timestamp
- index status chip
- settings button
- optional “doctor” button

## Sidebar

Use a collapsible tree:
- All Threads
- Providers
  - Codex
  - Claude Code
  - Cursor
- Projects
  - detected project names
- Repos / Paths
- Diagnostics
  - Parse Issues
  - Missing Roots
  - Orphaned Threads
- Saved filters (optional v1.1)

Sidebar should be persistent on desktop widths.

## Main list page

Use a dense data table.

Columns:
- thread title
- provider
- project
- repo/path
- updated
- messages
- tools
- status

Behavior:
- sortable columns
- filter chips
- compact row density
- row click opens detail
- keyboard navigation nice-to-have

## Thread detail page

Sections:
1. header meta
2. summary cards
3. source metadata
4. message timeline
5. raw source links/info
6. parse warnings

### Thread header
- title
- provider badge
- updated date
- status chip
- open source path button
- reparse single thread button (optional)

### Summary cards
- total messages
- user / assistant / tool counts
- first seen
- last seen
- project
- cwd/repo

### Message timeline
Compact chronological list:
- role badge
- timestamp
- preview
- expandable full content
- tool calls highlighted

### Raw/diagnostics
- source file path
- parser version
- hash
- parse issues tied to this thread

## Diagnostics pages

### Parse Issues
Table:
- provider
- path
- severity
- code
- count
- last seen

### Source Roots
Table:
- provider
- path
- status
- last scanned
- notes

### Index Runs
Table:
- started
- completed
- status
- providers
- changed files
- threads upserted
- errors

---

# 15. Visual Component Mapping (shadcn-oriented)

Use OSS shell style with:

- `Sidebar` pattern or custom app shell
- `Data Table`
- `Input`
- `Button`
- `Badge`
- `Card`
- `Tabs`
- `Collapsible`
- `Accordion`
- `DropdownMenu`
- `Tooltip`
- `Separator`
- `ScrollArea`
- `Sheet` for mobile fallback
- `Skeleton` for loading states
- `Toaster` for refresh/reindex notifications

## Styling rules

- compact density
- no oversized cards everywhere
- prioritize information density
- muted chrome, clear hierarchy
- monospace only for paths / IDs / raw snippets
- keep contrast readable
- responsive but desktop-first

---

# 16. Routing

## Routes

- `/`
  - default list view of all threads
- `/threads`
- `/threads/:threadId`
- `/providers`
- `/providers/:providerId`
- `/projects/:projectName`
- `/diagnostics`
- `/diagnostics/issues`
- `/diagnostics/roots`
- `/diagnostics/runs`
- `/settings`

## Query params

Support:
- `provider`
- `project`
- `status`
- `q`
- `sort`
- `dir`
- `page`
- `pageSize`

Example:
`/threads?provider=codex&project=foo&q=auth&sort=updatedAt&dir=desc`

---

# 17. Search Specification

## Global search v1

Search over:
- title
- project name
- repo path
- snippets
- optionally message previews if enabled

## Search UX

- top search box in header
- submits via query param
- search results reuse main table
- highlighted matches optional, not required in v1

## Search modes

### Default
Fast metadata search

### Optional advanced
Message content search if message FTS enabled

---

# 18. Refresh / Re-index Flow

## UX requirement

There must be a simple way from the HTML UI to trigger a local re-index.

## Minimal acceptable implementation

- POST `/actions/reindex`
- server starts reindex synchronously for v1
- upon completion:
  - set flash/toast status
  - redirect to previous page or `/threads`
  - page reload shows new data

## Nice but optional
- lightweight progress page or SSE progress stream

## Explicitly not needed in v1
- websocket complexity
- client-side state machine
- optimistic UI

---

# 19. Server Actions

## Endpoints

### `GET /`
Render shell + default thread list.

### `GET /threads`
Thread list with filters.

### `GET /threads/:threadId`
Thread detail.

### `GET /diagnostics/*`
Diagnostic pages.

### `POST /actions/reindex`
Run full or incremental reindex.

### `POST /actions/reindex/provider/:providerId`
Reindex one provider.

### `POST /actions/reindex/thread/:threadId`
Optional later.

### `POST /actions/doctor`
Run diagnostics.

### `GET /api/health`
Returns health summary JSON.

### `GET /api/stats`
Returns counts JSON.

Minimal JSON APIs are fine for utility and future scripting, but HTML pages remain primary.

---

# 20. Config Specification

## Config file

Use a local config file, e.g.

- `~/.config/agent-index/config.json`
or
- `agent-index.config.json` in cwd for dev

## Example

```json
{
  "dbPath": "~/.local/share/agent-index/index.sqlite",
  "server": {
    "host": "127.0.0.1",
    "port": 4821
  },
  "providers": {
    "codex": {
      "enabled": true,
      "roots": []
    },
    "claudeCode": {
      "enabled": true,
      "roots": []
    },
    "cursor": {
      "enabled": true,
      "roots": []
    }
  },
  "indexing": {
    "messageFts": false,
    "batchSize": 250,
    "maxPreviewLength": 600
  },
  "watch": {
    "enabled": false,
    "debounceMs": 1000
  },
  "excludes": [
    "**/node_modules/**",
    "**/.git/**"
  ]
}
```

## Config behavior

- if config missing, generate defaults
- allow env overrides
- validate at startup
- show effective config in `/settings`

---

# 21. CLI Specification

## Commands

### `agent-index serve`
- start local web server
- open browser optionally

### `agent-index reindex`
- run reindex once
- print summary

### `agent-index scan`
- print discovered roots and provider status without full UI

### `agent-index doctor`
- diagnose missing paths, malformed files, DB status

### `agent-index stats`
- print counts and DB summary

### `agent-index init`
- create default config
- optionally probe paths

## Examples

```bash
agent-index serve
agent-index reindex
agent-index reindex --provider cursor
agent-index doctor
agent-index scan --json
```

---

# 22. Project Structure

```text
agent-index/
├─ src/
│  ├─ app/
│  │  ├─ routes/
│  │  │  ├─ index.tsx
│  │  │  ├─ threads.tsx
│  │  │  ├─ thread-detail.tsx
│  │  │  ├─ diagnostics.tsx
│  │  │  ├─ settings.tsx
│  │  ├─ components/
│  │  │  ├─ app-shell/
│  │  │  ├─ thread-table/
│  │  │  ├─ thread-detail/
│  │  │  ├─ diagnostics/
│  │  │  ├─ ui/                 # shadcn-generated components
│  │  ├─ server/
│  │  │  ├─ router.ts
│  │  │  ├─ handlers/
│  │  │  ├─ actions/
│  │  │  ├─ ssr.tsx
│  │  ├─ styles/
│  │  │  ├─ globals.css
│  │  ├─ layout/
│  │  │  ├─ AppShell.tsx
│  │  │  ├─ SidebarTree.tsx
│  │  │  ├─ HeaderBar.tsx
│  │
│  ├─ core/
│  │  ├─ config/
│  │  ├─ logging/
│  │  ├─ utils/
│  │  ├─ types/
│  │
│  ├─ db/
│  │  ├─ client.ts
│  │  ├─ migrations/
│  │  ├─ schema.ts
│  │  ├─ repos/
│  │  ├─ fts.ts
│  │
│  ├─ indexer/
│  │  ├─ discovery/
│  │  ├─ pipeline/
│  │  ├─ normalization/
│  │  ├─ hashing/
│  │  ├─ parse-issues/
│  │
│  ├─ providers/
│  │  ├─ registry.ts
│  │  ├─ codex/
│  │  │  ├─ discover.ts
│  │  │  ├─ parse.ts
│  │  │  ├─ normalize.ts
│  │  ├─ claude-code/
│  │  ├─ cursor/
│  │
│  ├─ cli/
│  │  ├─ main.ts
│  │  ├─ commands/
│  │
│  ├─ main.ts
│
├─ public/
├─ scripts/
├─ test/
├─ agent-index.config.example.json
├─ package.json
├─ bunfig.toml
├─ tsconfig.json
└─ README.md
```

---

# 23. Adapter Contract

Each provider adapter must implement a strict interface.

```ts
export interface ProviderAdapter {
  id: string;
  displayName: string;

  discover(config: EffectiveConfig): Promise<DiscoveredRoot[]>;

  listCandidates(root: DiscoveredRoot): Promise<CandidateSource[]>;

  shouldReparse(candidate: CandidateSource, existing: ExistingSourceRecord | null): Promise<boolean>;

  parse(candidate: CandidateSource): Promise<ParsedThreadResult[]>;

  normalize(parsed: ParsedThreadResult[]): Promise<NormalizedThreadBundle[]>;

  healthcheck?(root: DiscoveredRoot): Promise<ProviderHealthReport>;
}
```

## Notes

- one candidate file may yield one or many threads depending on provider format
- parser should be resilient to partial corruption
- normalization must produce canonical fields

---

# 24. Parsing Rules

## General rules

1. Never trust provider formats to stay stable
2. Keep raw provider-specific parsing isolated
3. Normalize aggressively
4. Preserve source references for traceability
5. Skip unknown blocks instead of crashing

## Derived fields

At index time derive:
- title
- summary
- preview snippets
- counts by role
- latest timestamp
- likely project name
- likely repo path

These derived fields should avoid model calls.
Use deterministic heuristics only.

### Title heuristic example
Prefer:
1. provider title if available
2. first meaningful user message snippet
3. source filename fallback

### Summary heuristic
Use:
- first user message preview
- last assistant message preview
- no generated prose

---

# 25. HTML Rendering Strategy

## Key decision

Use **server-rendered React pages** with only minimal client behavior.

## Why

- fastest first paint
- easier local architecture
- avoids hydration-heavy app shell
- simpler to reason about

## Hydration strategy

### Server-rendered by default
- sidebar
- tables
- detail page
- diagnostics

### Tiny client enhancement only for:
- refresh button state
- optional table niceties
- optional persisted sidebar collapse
- toast notifications

## Rendering model

- server loads data from SQLite
- renders React component tree to HTML
- browser receives usable page immediately
- progressive enhancement scripts add minor UX polish

---

# 26. Data Table Specification

## Thread list table columns

Required:
- Title
- Provider
- Project
- Repo/Path
- Updated
- Messages
- Tools
- Status

Optional:
- Archived
- Errors
- First message preview

## Sorting
- updated desc default
- title asc
- provider asc
- project asc
- messages desc

## Pagination
- default 50 rows
- options: 25 / 50 / 100 / 250

## Row behavior
- click row to open detail
- modified click opens new tab
- keyboard accessible

---

# 27. Diagnostics / Doctor Mode

## Goals

Make local parsing problems visible and fixable.

## Checks

- config validity
- db path writable
- sqlite migrations applied
- provider roots exist
- root read permissions
- number of parse errors
- duplicate source paths
- orphaned rows
- missing FTS tables if enabled

## Doctor output
Both:
- terminal summary
- HTML diagnostics page

---

# 28. Logging

## Logging requirements

- structured logs
- console friendly
- file optional
- parse failures include provider + source path + short reason
- reindex summary always logged

## Levels
- info
- warn
- error
- debug

Debug should be opt-in.

---

# 29. Error Handling

## Principles

- fail soft
- isolate provider failures
- keep old indexed rows until replacement succeeds
- show actionable diagnostics

## UI behavior

When errors exist:
- show subtle warning chip in header
- link to diagnostics page

When refresh fails:
- keep current index
- show toast/banner
- preserve logs

---

# 30. Security / Privacy

## Requirements

- localhost only by default
- no remote analytics
- no external asset CDNs required
- no uploaded data
- no background network access
- source paths may be sensitive, so keep bind address local

## Optional
- `--host 0.0.0.0` only if user explicitly sets it

---

# 31. Packaging / Distribution

## v1
Run via Bun locally:
- `bun install`
- `bun run dev`
- `bun run serve`

## v1.1+
Compile distributable executable:
- one binary
- config and sqlite DB stored externally
- no runtime Node dependency

---

# 32. Acceptance Criteria

## Functional

- app discovers configured/default roots for supported providers
- app indexes threads into SQLite
- app shows unified thread list in browser
- app supports provider/project/search filters
- app opens thread detail pages
- app exposes diagnostics pages
- refresh index button works from UI
- app continues functioning if one adapter fails

## Performance

- startup does not force full scan
- main list page loads from existing index fast
- reindex skips unchanged files
- large dataset remains usable via pagination and indexed queries

## Quality

- clean TypeScript boundaries
- adapter contract documented
- no provider-specific spaghetti in UI layer
- migrations reproducible
- doctor command useful

---

# 33. Nice-to-Have Backlog

## v1.1
- watch mode
- saved filters
- provider enable/disable in UI
- reindex one provider from UI
- dark mode toggle
- open source file/folder integration

## v1.2
- duplicate thread detection
- import/export index metadata
- full message FTS toggle from settings
- richer timeline grouping
- keyboard shortcuts

## v1.3
- semantic search optional local embeddings
- threaded diffing across repeated sessions
- “project memory” lens
- repo/entity grouping heuristics

---

# 34. Implementation Plan

## Phase 1 — foundation
- scaffold Bun + TS + React + Tailwind + shadcn
- build app shell
- wire SQLite + migrations
- create config loader
- implement basic server/router

## Phase 2 — indexing core
- provider registry
- discovery layer
- source scanning
- index_runs + parse_issues
- threads/messages persistence

## Phase 3 — first adapters
- Codex adapter
- Claude Code adapter
- Cursor adapter
- normalization heuristics

## Phase 4 — UI
- thread list
- filters
- thread detail
- diagnostics pages
- settings summary page

## Phase 5 — refresh flow
- POST reindex action
- toast + redirect
- progress summary

## Phase 6 — polish
- incremental optimizations
- doctor command
- compact styling
- better empty states
- packaging

---

# 35. Suggested Coding Constraints for Codex

Use these constraints when generating the app:

1. Bun-native first. Avoid Node-only assumptions.
2. Prefer Bun built-ins over extra dependencies where practical.
3. Keep the client bundle tiny.
4. SSR pages first, progressive enhancement second.
5. Keep adapters isolated and testable.
6. Avoid overengineering with CQRS/event buses/etc.
7. Use SQLite migrations, not ad hoc table creation scattered across the codebase.
8. Keep parsing deterministic and cheap.
9. Design for corrupted provider files.
10. Expose enough logs to debug real-world path issues.

---

# 36. Concrete Build Request for Codex

Build a Bun-native local web app called `agent-index` with the architecture above.

## Must-have technical outcomes

- Bun + TypeScript project
- local SQLite DB with migrations
- Bun HTTP server
- SSR React UI
- Tailwind + shadcn/ui
- app shell with header + sidebar + data table
- provider adapter system
- indexer with incremental reindex
- `/actions/reindex` endpoint triggered by UI button
- diagnostics pages
- CLI commands: `serve`, `reindex`, `scan`, `doctor`, `stats`
- clean README
- example config
- seedable local development setup

## Must-have UX outcomes

- compact, readable layout
- no ugly placeholder admin template feel
- sidebar tree + main table + detail pane/page
- visible last indexed status
- one-click refresh index
- usable with thousands of threads

## Must-have code quality outcomes

- strongly typed domain model
- clear folder structure
- isolated providers
- no giant 2,000-line files
- sensible comments only where needed
- no dead abstractions

---

# 37. Suggested Prompt Footer for Codex

When implementing:
- make reasonable assumptions
- choose the simplest path that preserves speed and maintainability
- prefer working vertical slices over speculative abstraction
- include a few realistic mock parsers/tests if exact provider formats are unknown
- keep TODO comments where provider-specific format verification is required
- produce a runnable MVP, not just scaffolding

If exact local storage shapes for providers are uncertain:
- implement adapters behind clean parser interfaces
- isolate assumptions in one file per provider
- document expected path patterns and parsing assumptions in README and adapter comments
- make it easy to patch those assumptions later without touching the rest of the system
