export type SearchMode = "hybrid" | "semantic" | "keyword";

export interface SearchResult {
  chunkId: string;
  score: number;
  provider: string;
  threadId: string;
  threadTitle: string | null;
  messageId: string | null;
  projectName: string | null;
  /** Task / user context for the result card — not the matched message chunk. */
  initialPromptPreview: string | null;
  firstUserSnippet: string | null;
  contentPreview: string;
  matchedBy: "semantic" | "keyword" | "hybrid";
}

export interface ChunkRecord {
  id: string;
  threadId: string;
  messageId: string | null;
  chunkIndex: number;
  content: string;
  contentHash: string;
  charCount: number;
  createdAt: string;
}

export interface SemanticSearchQuery {
  q: string;
  mode: SearchMode;
  provider?: string | null;
  project?: string | null;
  limit: number;
}

export interface SemanticDiagnostics {
  chunkCount: number;
  embeddingCount: number;
  embeddingModel: string;
  vectorDbAvailable: boolean;
  ftsAvailable: boolean;
}
