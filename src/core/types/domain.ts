export type ProviderId = "codex" | "claude-code" | "cursor";

export type ThreadStatus = "ok" | "partial" | "error" | "orphaned";
export type ParseSeverity = "info" | "warn" | "error";
export type MessageRole = "system" | "user" | "assistant" | "tool" | "other";
export type MessageKind = "chat" | "tool_call" | "tool_result" | "reasoning" | "event";

export interface ProviderConfig {
  enabled: boolean;
  roots: string[];
}

export interface AppConfig {
  dbPath: string;
  server: {
    host: string;
    port: number;
  };
  providers: {
    codex: ProviderConfig;
    claudeCode: ProviderConfig;
    cursor: ProviderConfig;
  };
  indexing: {
    messageFts: boolean;
    batchSize: number;
    maxPreviewLength: number;
  };
  watch: {
    enabled: boolean;
    debounceMs: number;
  };
  excludes: string[];
}

export interface DiscoveredRoot {
  providerId: ProviderId;
  path: string;
  status: "ok" | "missing" | "error" | "disabled";
  notes?: string;
}

export interface CandidateSource {
  providerId: ProviderId;
  sourceRootPath: string;
  path: string;
  type: string;
  size: number;
  mtimeMs: number;
}

export interface ExistingSourceRecord {
  sourcePath: string;
  size: number;
  mtimeMs: number;
  contentHash: string | null;
}

export interface NormalizedMessage {
  id?: string;
  ordinal: number;
  role: MessageRole;
  kind: MessageKind;
  createdAt: string | null;
  contentText: string | null;
  contentPreview: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  sourceMessageId?: string | null;
  sourcePath: string;
  sourceOffset?: number | null;
  parseStatus: "ok" | "partial" | "error";
}

export interface ParseIssueInput {
  providerId: ProviderId;
  sourcePath: string;
  severity: ParseSeverity;
  code: string;
  message: string;
}

export interface NormalizedThreadBundle {
  providerId: ProviderId;
  providerThreadId: string;
  sourceRootPath: string;
  sourcePath: string;
  sourceType: string;
  title: string | null;
  projectName: string | null;
  repoPath: string | null;
  cwd: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isArchived: boolean;
  status: ThreadStatus;
  summary: string | null;
  firstUserSnippet: string | null;
  lastAssistantSnippet: string | null;
  tags: string[];
  capabilities: Record<string, boolean>;
  flags: Record<string, boolean>;
  metadata: Record<string, unknown>;
  sourceArtifacts?: Array<{
    path: string;
    role: string;
  }>;
  messages: NormalizedMessage[];
  issues: ParseIssueInput[];
}

export interface ProviderScanResult {
  providerId: ProviderId;
  roots: DiscoveredRoot[];
  candidates: CandidateSource[];
}

export interface IndexRunSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "ok" | "partial" | "failed";
  providers: ProviderId[];
  rootsScanned: number;
  filesSeen: number;
  filesChanged: number;
  threadsUpserted: number;
  messagesUpserted: number;
  errors: number;
  notes: string | null;
}
