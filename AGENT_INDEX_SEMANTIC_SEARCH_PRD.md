# PRD — Agent Index Semantic Search + Hybrid Retrieval

## Contextual Extension for Existing `agent-index` Application

### Version 1.0

### Status: Draft

---

# 1. Context

`agent-index` already exists and partially works.

Current capabilities already include:

- provider discovery
- local indexing of AI agent conversations
- SQLite-based metadata storage
- thread browsing UI
- provider adapters
- local-first architecture
- Bun runtime
- server-rendered HTML UI

However, the current retrieval layer is still mostly metadata-oriented and insufficient once the indexed dataset becomes large.

The missing capability is:

> fast, local semantic retrieval across conversations and messages

This PRD extends the existing architecture with:

- semantic search
- hybrid retrieval
- message-level search
- conversational memory retrieval
- contextual thread search
- future RAG-ready foundations

without changing the philosophy of the application:

- local-first
- Bun-native
- zero external services
- SQLite-centric
- fast cold startup
- low operational complexity

---

# 2. Problem Statement

Right now users can:

- browse threads
- filter threads
- search simple metadata

But once the number of conversations grows across:

- Codex
- Claude Code
- Cursor
- future tools

manual browsing becomes inefficient.

Example problem:

User remembers:

> "there was a conversation about preview infra and ephemeral deployments"

but does not remember:

- exact provider
- exact keywords
- exact project
- exact thread title

Simple keyword search becomes insufficient.

---

# 3. Goals

## Primary Goals

Add fully local:

- semantic search
- hybrid retrieval
- message-level retrieval
- contextual search across conversations

while preserving:

- extremely fast local UX
- offline operation
- low memory overhead
- SQLite-first architecture

---

## Secondary Goals

Enable future:

- RAG over conversations
- AI memory retrieval
- semantic clustering
- related threads
- conversational recall
- semantic project grouping
- local knowledge graph experiments

---

# 4. Non-Goals

## Not included in v1

- cloud sync
- external vector databases
- distributed indexing
- GPU optimization
- live daemon indexing
- OCR
- PDF extraction
- reranking models
- cross-encoder reranking
- graph retrieval
- semantic summarization
- AI-generated summaries
- multi-user support
- remote hosting

---

# 5. Existing Architecture Constraints

This feature MUST integrate into the existing architecture.

Do NOT redesign the application from scratch.

Must remain compatible with:

- Bun runtime
- existing SQLite database
- existing provider adapters
- existing indexing pipeline
- existing SSR UI architecture
- existing thread/message schema

---

# 6. Product Vision

The application should evolve from:

> "thread browser"

into:

> "local memory/search system for AI agent workflows"

The user should be able to ask:

"where did I discuss preview environments?"

and retrieve:

- relevant messages
- related threads
- semantically related conversations

even if wording differs.

---

# 7. Search Modes

## Mode 1 — Metadata Search

Existing behavior.

Searches:

- thread title
- project name
- repo path
- provider

Fast exact matching.

---

## Mode 2 — Keyword Search

Uses SQLite FTS5.

Searches:

- message content
- snippets
- thread metadata

Useful for:

- stack traces
- API names
- config keys
- exact terms

---

## Mode 3 — Semantic Search

Uses embeddings.

Searches conceptual meaning.

Example query:

preview environments

Should find:

- ephemeral deployments
- temporary staging infra
- branch environments

without exact matches.

---

## Mode 4 — Hybrid Search

Combines:

- semantic similarity
- keyword ranking
- metadata weighting

This should become default mode.

---

# 8. Architecture Extension

## Existing Architecture

Current:

provider adapters
-> normalization
-> sqlite storage
-> ui

Extended:

provider adapters
-> normalization
-> chunking
-> embeddings
-> sqlite storage
-> retrieval engine
-> ui

---

# 9. Core Design Principle

IMPORTANT:

The application startup must remain fast.

Therefore:

- embeddings must NOT be regenerated on startup
- semantic indexes must persist
- all retrieval must operate from SQLite

---

# 10. Embedding Engine

## Requirements

Must work:

- fully local
- fully offline
- inside Bun runtime

Must NOT require:

- Ollama
- Python
- external APIs
- vector DB servers

---

## Implementation

Dependency:

bun add @huggingface/transformers

---

## Initial Model

Xenova/all-MiniLM-L6-v2

---

## Embedding Dimensions

384

Must remain synchronized with vector schema.

---

# 11. Database Changes

## New Tables

### message_chunks

Stores semantic chunks.

### message_chunk_embeddings

Stores vector embeddings.

### message_chunks_fts

Stores FTS indexes.

---

# 12. Chunking Strategy

## Rules

- chunk size: 500-1000 chars
- overlap: 100-150 chars

Prefer splitting by:

- message boundaries
- paragraph boundaries

Fallback to hard splits.

---

# 13. What Gets Embedded

## Embed

- user messages
- assistant messages
- thread snippets

## Do NOT embed

- giant logs
- raw binary content
- repetitive noise

---

# 14. Indexing Pipeline Changes

Current:

parse
-> normalize
-> store

New:

parse
-> normalize
-> chunk
-> embed
-> persist vectors
-> update FTS

---

# 15. Incremental Indexing

Rules:

- unchanged content should NOT regenerate embeddings
- changed content regenerates affected chunks only
- deleted messages purge vectors and FTS rows

---

# 16. sqlite-vec Integration

Dependency:

bun add sqlite-vec

Must integrate directly with Bun SQLite.

No external vector database allowed.

---

# 17. Retrieval Engine

Components:

- semantic-search.ts
- keyword-search.ts
- hybrid-search.ts

---

# 18. Semantic Search Flow

1. embed query
2. vector similarity search
3. retrieve chunks
4. map chunks to threads/messages
5. return ranked results

---

# 19. Hybrid Retrieval

Default formula:

final_score =
  semantic_score * 0.7 +
  keyword_score * 0.3

---

# 20. Search Result Model

```ts
type SearchResult = {
  chunkId: string;
  score: number;

  provider: string;

  threadId: string;
  threadTitle: string;

  messageId?: string;

  projectName?: string;

  contentPreview: string;

  matchedBy: "semantic" | "keyword" | "hybrid";
}
```

---

# 21. UI Changes

## Global Search

Replace existing search with hybrid search.

---

## Result View

Results should show:

- preview snippet
- provider
- thread
- project
- score
- match type

---

## Result Interaction

Clicking result:

- opens thread
- scrolls to relevant message/chunk

---

# 22. Related Conversations

Thread detail page should show:

Related Conversations

based on semantic similarity.

---

# 23. Search Modes

UI filters:

- Hybrid
- Semantic only
- Keyword only

---

# 24. Performance Targets

Target scale:

10k - 500k chunks

Should work on laptop CPUs.

---

# 25. Memory Constraints

Do NOT load all embeddings into RAM.

Queries must execute through SQLite.

---

# 26. Diagnostics

Add diagnostics screen:

Semantic Search Status

Should show:

- chunk count
- embedding count
- embedding model
- vector DB status
- embedding failures

---

# 27. CLI Extensions

Examples:

agent-index reindex --semantic

agent-index search "preview environments"

agent-index search "preview infra" --hybrid

---

# 28. Config Extensions

```json
{
  "semanticSearch": {
    "enabled": true,
    "model": "Xenova/all-MiniLM-L6-v2",
    "chunkSize": 800,
    "chunkOverlap": 120,
    "enableFts": true,
    "mode": "hybrid"
  }
}
```

---

# 29. Future Extensions

Potential future additions:

- reranking
- semantic clustering
- duplicate detection
- temporal semantic search
- semantic tags
- local RAG assistant

---

# 30. Implementation Order

## Phase 1

- sqlite-vec integration
- schema migration
- embedding generation

## Phase 2

- chunking pipeline

## Phase 3

- semantic indexing

## Phase 4

- retrieval engine

## Phase 5

- hybrid ranking

## Phase 6

- UI integration

---

# 31. Acceptance Criteria

Complete when:

- semantic indexing works
- vectors persist locally
- semantic search works
- keyword search works
- hybrid retrieval works
- UI supports semantic search
- related conversations work
- no external services required
- works offline
- startup remains fast

---

# 32. Recommended File Structure

src/
  semantic-search/
    chunking/
    embeddings/
    retrieval/
    storage/
    indexing/
    ui/
    types/

---

# 33. Final Recommendation

Keep architecture:

Bun
+ SQLite
+ sqlite-vec
+ FTS5
+ local embeddings

Avoid:

- Pinecone
- Qdrant
- Weaviate
- external services
- daemon complexity

The system should remain:

- local-first
- portable
- debuggable
- fast
- operationally simple
