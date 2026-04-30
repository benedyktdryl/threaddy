import type { ReactNode } from "react";
import { marked } from "marked";
import { Bot, FileText, Filter, User, Wrench, CornerDownRight } from "lucide-react";

import type { AppConfig } from "../../core/types/domain";
import type {
  DashboardStats,
  GroupSummaryRow,
  IndexRunRow,
  ParseIssueRow,
  SourceRootRow,
  ThreadDetail,
  ThreadListQuery,
  ThreadListResult,
  ThreadSortField,
  SortDir,
} from "../../db/repos/query-service";
import { searchResultHeadline } from "../../semantic-search/format-search-display";
import type { SearchResult, SearchMode } from "../../semantic-search/types/index";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardSection } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableWrap, Td, Th, Tr } from "../components/ui/table";
import { AppShell } from "../layout/app-shell";

// Character count past which a message body is collapsed by default
const MSG_COLLAPSE_THRESHOLD = 500;

// Markdown body — renders with collapsible support
function MarkdownBody({ text, collapsible = true }: { text: string; collapsible?: boolean }) {
  const html = marked.parse(text ?? "") as string;
  const isLong = collapsible && text.length > MSG_COLLAPSE_THRESHOLD;
  const inner = <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
  if (!isLong) return inner;
  return (
    <div>
      <div className="msg-collapsible relative max-h-28 overflow-hidden">
        {inner}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/90 to-transparent" />
      </div>
      <button className="msg-expand-btn mt-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline" type="button">
        show more
      </button>
    </div>
  );
}

// Try to parse JSON and return formatted string, or null if not JSON
function tryParseJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { return null; }
}

// Render tool call arguments as a formatted block
function ToolCallBody({ toolName, text }: { toolName: string | null; text: string }) {
  const parsed = tryParseJson(text);
  return (
    <div className="space-y-1.5">
      {parsed ? (
        <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-md border border-[hsl(var(--border))]">
          {Object.entries(parsed).map(([k, v]) => {
            const val = typeof v === "string" ? v : JSON.stringify(v, null, 2);
            const isLong = val.length > 300;
            return (
              <div className="flex min-w-0 gap-0" key={k}>
                <div className="w-28 shrink-0 bg-[hsl(var(--muted))] px-2.5 py-1.5 font-mono text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
                  {k}
                </div>
                <div className="min-w-0 flex-1 px-2.5 py-1.5">
                  {isLong ? (
                    <div>
                      <div className="msg-collapsible relative max-h-20 overflow-hidden">
                        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{val}</pre>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white/90 to-transparent" />
                      </div>
                      <button className="msg-expand-btn mt-0.5 text-[10px] text-blue-600 hover:underline" type="button">show more</button>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{val}</pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="rounded-md bg-[hsl(var(--muted))] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">{text}</pre>
      )}
    </div>
  );
}

// Render tool result — try to extract metadata header vs output body
function ToolResultBody({ text }: { text: string }) {
  // Pattern: "Command: ... Chunk ID: ... Wall time: ... Process exited with code N ... Output: ..." (codex format)
  const outputMatch = text.match(/\bOutput:\s*([\s\S]*)$/);
  const exitMatch = text.match(/[Pp]rocess exited with code\s+(\d+)/);
  const timeMatch = text.match(/Wall time:\s*([\d.]+\s*seconds?)/i);
  const body = outputMatch ? outputMatch[1].trim() : text;
  const exitCode = exitMatch ? Number(exitMatch[1]) : null;
  const wallTime = timeMatch ? timeMatch[1] : null;

  const isLongBody = body.length > MSG_COLLAPSE_THRESHOLD;

  return (
    <div className="space-y-1.5">
      {/* Metadata badges */}
      {(exitCode !== null || wallTime) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {exitCode !== null && (
            <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${exitCode === 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              exit {exitCode}
            </span>
          )}
          {wallTime && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{wallTime}</span>}
        </div>
      )}
      {/* Output body */}
      {body && (
        <div>
          <div className={`msg-collapsible relative overflow-hidden${isLongBody ? " max-h-28" : ""}`}>
            <pre className="whitespace-pre-wrap break-words rounded-md bg-[hsl(var(--muted))] px-3 py-2 font-mono text-[11px] leading-relaxed">{body}</pre>
            {isLongBody && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/90 to-transparent" />
            )}
          </div>
          {isLongBody && (
            <button className="msg-expand-btn mt-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline" type="button">show more</button>
          )}
        </div>
      )}
    </div>
  );
}

type MsgMeta = ThreadDetail["messages"][number];

function msgRoleIcon(role: string, kind: string) {
  if (kind === "tool_call")   return <Wrench size={12} className="text-amber-600" />;
  if (kind === "tool_result") return <CornerDownRight size={12} className="text-[hsl(var(--muted-foreground))]" />;
  if (role === "user")        return <User size={12} className="text-blue-600" />;
  if (role === "assistant")   return <Bot size={12} className="text-violet-600" />;
  return <FileText size={12} className="text-[hsl(var(--muted-foreground))]" />;
}

function msgRoleColor(role: string, kind: string) {
  if (kind === "tool_call")   return "border-l-amber-300 bg-amber-50/40";
  if (kind === "tool_result") return "border-l-transparent bg-[hsl(var(--muted))]/30";
  if (role === "user")        return "border-l-blue-300 bg-blue-50/30";
  if (role === "assistant")   return "border-l-violet-300 bg-white";
  return "border-l-transparent";
}

function MessageRow({ msg, compact = false, isFinal = false }: { msg: MsgMeta; compact?: boolean; isFinal?: boolean }) {
  const text = msg.contentText ?? msg.contentPreview ?? "";
  const isToolCall = msg.kind === "tool_call";
  const isToolResult = msg.kind === "tool_result";

  return (
    <div
      className={`flex gap-3 border-l-2 px-4 py-3 ${msgRoleColor(msg.role, msg.kind)}`}
      data-msg-kind={msg.kind}
      data-msg-role={msg.role}
    >
      {/* Role icon */}
      <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-[hsl(var(--border))]">
          {msgRoleIcon(msg.role, msg.kind)}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {isToolCall && msg.toolName && (
            <span className="font-mono text-[11px] font-semibold text-amber-700">{msg.toolName}</span>
          )}
          {!isToolCall && !isToolResult && (
            <span className={`text-[11px] font-semibold ${msg.role === "user" ? "text-blue-700" : msg.role === "assistant" ? "text-violet-700" : "text-[hsl(var(--muted-foreground))]"}`}>
              {msg.role}
            </span>
          )}
          {isToolResult && <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">result</span>}
          {isFinal && (
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">
              final
            </span>
          )}
          <span className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">{msg.createdAt?.slice(0, 16)?.replace("T", " ") ?? ""}</span>
        </div>

        {text ? (
          isToolCall ? (
            <ToolCallBody text={text} toolName={msg.toolName ?? null} />
          ) : isToolResult ? (
            <ToolResultBody text={text} />
          ) : (
            <MarkdownBody text={text} />
          )
        ) : (
          <span className="text-[12px] text-[hsl(var(--muted-foreground))]">(no content)</span>
        )}
      </div>
    </div>
  );
}

type TimelineFilter = "all" | "chat" | "tools";

function Timeline({
  messages,
  capabilities,
}: {
  messages: MsgMeta[];
  capabilities: Record<string, boolean>;
}) {
  // Deduplicate: remove assistant `kind=event` rows that are always paired with an
  // identical `kind=chat` message from codex (agent_message + response_item duplicate).
  const deduped = messages.filter((m, i) => {
    if (m.role !== "assistant" || m.kind !== "event") return true;
    // Drop if the adjacent message (one step earlier in ordinal, i.e. i-1 in DESC order)
    // has the same role, is kind=chat, and has the same preview content.
    const next = messages[i - 1]; // DESC order: next ordinal is previous in array
    if (next && next.role === "assistant" && next.kind === "chat" &&
        (next.contentPreview ?? next.contentText) === (m.contentPreview ?? m.contentText)) {
      return false;
    }
    // Also check i+1 direction
    const prev = messages[i + 1];
    if (prev && prev.role === "assistant" && prev.kind === "chat" &&
        (prev.contentPreview ?? prev.contentText) === (m.contentPreview ?? m.contentText)) {
      return false;
    }
    return true;
  });

  // Find the most-recent (first in DESC array) actual assistant chat message — that's the final output
  const finalIdx = deduped.findIndex((m) => m.role === "assistant" && m.kind !== "event" && m.kind !== "tool_result" && m.kind !== "tool_call");

  const chatCount = deduped.filter((m) => m.role === "user" || m.role === "assistant").length;
  const toolCount = deduped.filter((m) => m.kind === "tool_call" || m.kind === "tool_result").length;

  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Timeline · {deduped.length} messages
          </div>
          {/* Filter pills */}
          <div className="flex items-center gap-1.5" id="msg-filter-bar">
            <Filter className="shrink-0 text-[hsl(var(--muted-foreground))]" size={11} />
            {(["all", "chat", "tools"] as TimelineFilter[]).map((f) => (
              <button
                className={`rounded px-2 py-0.5 text-[10px] transition-colors msg-filter-btn ${f === "all" ? "bg-[hsl(var(--muted))] font-medium text-foreground" : "text-[hsl(var(--muted-foreground))] hover:text-foreground"}`}
                data-filter={f}
                key={f}
                type="button"
              >
                {f === "all" ? `All (${deduped.length})` : f === "chat" ? `Chat (${chatCount})` : `Tools (${toolCount})`}
              </button>
            ))}
          </div>
        </div>
      </CardSection>
      {capabilities.messages === false && (
        <CardSection>
          <div className="text-[12px] text-muted-foreground">Metadata-first provider — message bodies may be sparse.</div>
        </CardSection>
      )}
      {deduped.length > 0 ? (
        <div className="divide-y divide-border" id="msg-list">
          {deduped.map((msg, i) => (
            <MessageRow compact isFinal={i === finalIdx} key={`${msg.ordinal}-${i}`} msg={msg} />
          ))}
        </div>
      ) : (
        <CardSection>
          <div className="text-sm text-muted-foreground">No message timeline available.</div>
        </CardSection>
      )}
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "partial"
        ? "bg-amber-400"
        : "bg-rose-500";
  return <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground">{children}</span>
    </div>
  );
}

const SORT_OPTIONS: { field: ThreadSortField; label: string }[] = [
  { field: "updatedAt", label: "Date" },
  { field: "messageCount", label: "Msgs" },
  { field: "toolCallCount", label: "Tools" },
  { field: "title", label: "Title" },
];

function SortBar({ query, basePath, previewId }: { query: ThreadListQuery; basePath: string; previewId: string | null }) {
  const activeSort = query.sort ?? "updatedAt";
  const activeDir = query.dir ?? "desc";
  const hiding = query.hideSubagents !== false;

  return (
    <div className="flex items-center justify-between gap-0.5">
      <div className="flex items-center gap-0.5">
        <span className="mr-1 text-[10px] text-[hsl(var(--sidebar-muted))]">Sort:</span>
        {SORT_OPTIONS.map(({ field, label }) => {
          const isActive = activeSort === field;
          const nextDir: SortDir = isActive && activeDir === "desc" ? "asc" : "desc";
          const href = `${basePath}${qs({ ...query, sort: field, dir: nextDir, page: 1, preview: previewId })}`;
          return (
            <a
              className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${isActive ? "bg-blue-100 font-medium text-blue-700" : "text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-fg))]"}`}
              href={href}
              key={field}
            >
              {label}{isActive ? (activeDir === "desc" ? " ↓" : " ↑") : ""}
            </a>
          );
        })}
      </div>
      {/* Sub-agent toggle */}
      <a
        className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${hiding ? "bg-violet-100 font-medium text-violet-700" : "text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-fg))]"}`}
        href={`${basePath}${qs({ ...query, hideSubagents: !hiding, page: 1, preview: previewId })}`}
        title={hiding ? "Sub-agents hidden — click to show all threads" : "Showing all threads including sub-agents — click to hide sub-agents"}
      >
        {hiding ? "no subs" : "incl. subs"}
      </a>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";
  return <Badge className={className}>{status}</Badge>;
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || String(value) === "") {
      continue;
    }
    // Booleans: only include when false (true is the default for hideSubagents)
    if (key === "hideSubagents") {
      if (value === false) search.set(key, "0");
      // true is the default, omit it to keep URLs clean
      continue;
    }
    search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

function Notice({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <Card>
      <CardSection>
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{message}</Badge>
      </CardSection>
    </Card>
  );
}

function SavedFiltersManager({
  currentPath,
  savedFilters,
}: {
  currentPath: string;
  savedFilters: Array<{ id: string; name: string; href: string }>;
}) {
  if (savedFilters.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardSection>
        <h3 className="text-lg font-semibold tracking-tight">Saved Filters</h3>
        <div className="text-sm text-muted-foreground">Rename or remove shortcuts without leaving the thread view.</div>
      </CardSection>
      <CardSection>
        <div className="grid gap-3">
          {savedFilters.map((filter) => (
            <div className="grid gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_auto] lg:items-center" key={filter.id}>
              <div className="min-w-0">
                <a href={filter.href}>
                  <strong>{filter.name}</strong>
                </a>
                <div className="font-mono text-xs text-muted-foreground">{filter.href}</div>
              </div>
              <form action={`/actions/saved-filters/${encodeURIComponent(filter.id)}/rename`} className="flex flex-col gap-2 lg:flex-row lg:items-center" method="post">
                <input name="redirectTo" type="hidden" value={currentPath} />
                <Input aria-label={`Rename ${filter.name}`} defaultValue={filter.name} name="name" />
                <Button type="submit" variant="secondary">
                  Rename
                </Button>
              </form>
              <form action={`/actions/saved-filters/${encodeURIComponent(filter.id)}/delete`} method="post">
                <input name="redirectTo" type="hidden" value={currentPath} />
                <Button type="submit" variant="ghost">
                  Delete
                </Button>
              </form>
            </div>
          ))}
        </div>
      </CardSection>
    </Card>
  );
}

function ScopeSummary({
  label,
  summary,
  filterHref,
}: {
  label: string;
  summary: GroupSummaryRow;
  filterHref: string;
}) {
  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap gap-2">
          <Badge>{label}</Badge>
          <Badge>{summary.count} threads</Badge>
        </div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{summary.name}</h2>
        <div className="text-sm text-muted-foreground">Latest update: {summary.latestUpdatedAt ?? "unknown"}</div>
      </CardSection>
      <CardSection>
        <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
          <div className="text-muted-foreground">Healthy</div>
          <div>{summary.okCount}</div>
          <div className="text-muted-foreground">Partial</div>
          <div>{summary.partialCount}</div>
          <div className="text-muted-foreground">Browse threads</div>
          <div>
            <a href={filterHref}>
              <Button type="button" variant="secondary">
                Open Filtered List
              </Button>
            </a>
          </div>
        </div>
      </CardSection>
    </Card>
  );
}

type ShellProps = {
  config: AppConfig;
  currentPath: string;
  stats: DashboardStats;
  projects: Array<{ projectName: string; count: number }>;
  providers: Array<{ providerId: string; count: number }>;
  savedFilters: Array<{ id: string; name: string; href: string }>;
};

function ThreadPreviewContent({ detail, relatedThreads }: { detail: ThreadDetail; relatedThreads?: SearchResult[] }) {
  const { thread, messages, sources, issues } = detail;
  const capabilities = thread.capabilitiesJson ? (JSON.parse(thread.capabilitiesJson) as Record<string, boolean>) : {};
  const wordCount = messages.reduce((sum, m) => {
    const text = m.contentText ?? m.contentPreview ?? "";
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={thread.status} />
          <Badge>{thread.providerId}</Badge>
          {thread.isArchived ? <Badge>archived</Badge> : null}
          <a className="ml-auto text-[12px] text-muted-foreground hover:text-foreground hover:underline" href={`/threads/${thread.id}`}>
            Open full view →
          </a>
        </div>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">{thread.title ?? "(untitled)"}</h2>

        {thread.initialPrompt && (
          <Card className="mb-4">
            <CardSection>
              <div className="mb-2 flex items-center gap-1.5">
                <FileText size={12} className="text-blue-600" />
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Initial Prompt</div>
              </div>
              <MarkdownBody collapsible text={thread.initialPrompt} />
            </CardSection>
          </Card>
        )}

        <Timeline capabilities={capabilities} messages={messages} />
      </div>

      {/* Properties panel */}
      <aside
        className="w-[220px] shrink-0 overflow-y-auto bg-[hsl(var(--sidebar-bg))] py-4"
        style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
      >
        <div className="space-y-4 px-3">
          <div className="space-y-3">
            <PropRow label="Type">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{thread.providerId}</span>
            </PropRow>
            <PropRow label="Status"><StatusBadge status={thread.status} /></PropRow>
          </div>

          <div className="border-t border-[hsl(var(--sidebar-border))]" />

          <div className="space-y-3">
            <PropRow label="Created">{thread.createdAt ?? "—"}</PropRow>
            <PropRow label="Modified">{thread.updatedAt ?? "—"}</PropRow>
          </div>

          <div className="border-t border-[hsl(var(--sidebar-border))]" />

          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Info</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              {([
                ["Messages", thread.messageCount],
                ["~Words", wordCount > 0 ? wordCount.toLocaleString() : "—"],
                ["User", thread.userMessageCount],
                ["Assistant", thread.assistantMessageCount],
                ["Tool calls", thread.toolCallCount],
                ["Errors", thread.errorCount],
              ] as [string, string | number][]).map(([label, val]) => (
                <div key={label}>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="text-[13px] font-medium tabular-nums">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {thread.projectName && (
            <>
              <div className="border-t border-[hsl(var(--sidebar-border))]" />
              <PropRow label="Project">{thread.projectName}</PropRow>
            </>
          )}

          {(thread.repoPath ?? thread.cwd) && (
            <PropRow label="Repo">
              <span className="break-all font-mono text-[11px]">{thread.repoPath ?? thread.cwd}</span>
            </PropRow>
          )}

          {relatedThreads && relatedThreads.length > 0 && (
            <>
              <div className="border-t border-[hsl(var(--sidebar-border))]" />
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Related</div>
                {relatedThreads.map((r) => (
                  <a
                    className="block rounded bg-[hsl(var(--sidebar-hover))] px-2 py-1.5 hover:bg-[hsl(var(--sidebar-active))]"
                    href={`/threads?preview=${encodeURIComponent(r.threadId)}`}
                    key={r.threadId}
                  >
                    <div className="line-clamp-2 text-[11px] leading-snug">
                      {searchResultHeadline(r.threadTitle, r.initialPromptPreview, r.firstUserSnippet)}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{r.score.toFixed(2)}</div>
                  </a>
                ))}
              </div>
            </>
          )}

          {sources.length > 0 && (
            <>
              <div className="border-t border-[hsl(var(--sidebar-border))]" />
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sources</div>
                {sources.map((s) => (
                  <div className="rounded bg-[hsl(var(--sidebar-hover))] px-2 py-1.5" key={`${s.sourceRole}-${s.sourcePath}`}>
                    <div className="break-all font-mono text-[10px]">{s.sourcePath}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{s.sourceRole}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {issues.length > 0 && (
            <>
              <div className="border-t border-[hsl(var(--sidebar-border))]" />
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Issues · {issues.length}</div>
                {issues.map((entry, i) => (
                  <div className="rounded bg-[hsl(var(--sidebar-hover))] px-2 py-1.5" key={`${entry.code}-${i}`}>
                    <div className="flex items-center gap-1"><StatusBadge status={entry.severity} /><span className="font-mono text-[10px]">{entry.code}</span></div>
                    <div className="mt-0.5 text-[11px]">{entry.message}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ThreadSplitLayout({
  result,
  query,
  projects,
  providers,
  previewId,
  previewDetail,
  relatedThreads,
  basePath,
  scopeInfo,
}: {
  result: ThreadListResult;
  query: ThreadListQuery;
  projects: Array<{ projectName: string; count: number }>;
  providers: Array<{ providerId: string; count: number }>;
  previewId: string | null;
  previewDetail: ThreadDetail | null;
  relatedThreads?: SearchResult[];
  basePath: string;
  scopeInfo?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  function previewHref(threadId: string) {
    const params: Record<string, string | number | null | undefined> = { ...query, preview: threadId };
    return `${basePath}${qs(params)}`;
  }

  return (
    <div className="flex min-h-0 w-full overflow-hidden">
      {/* Thread list column */}
      <div
        className="flex w-[300px] shrink-0 flex-col overflow-hidden bg-[hsl(var(--sidebar-bg))]"
        style={{ borderRight: "1px solid hsl(var(--sidebar-border))" }}
      >
        {/* Scope header (for provider/project pages) */}
        {scopeInfo && (
          <div className="shrink-0 border-b border-[hsl(var(--sidebar-border))] px-3 py-1.5">
            <span className="text-[11px] text-[hsl(var(--sidebar-muted))]">{scopeInfo}</span>
          </div>
        )}

        {/* Compact filter + sort bar */}
        <div className="shrink-0 border-b border-[hsl(var(--sidebar-border))] px-3 py-2 space-y-1.5">
          <form action={basePath} data-auto-submit="true" method="get">
            {previewId && <input name="preview" type="hidden" value={previewId} />}
            {query.sort && <input name="sort" type="hidden" value={query.sort} />}
            {query.dir && <input name="dir" type="hidden" value={query.dir} />}
            {query.hideSubagents === false && <input name="hideSubagents" type="hidden" value="0" />}
            <input name="page" type="hidden" value="1" />
            <input
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              defaultValue={query.q ?? ""}
              name="q"
              placeholder="Search threads…"
              type="text"
            />
          </form>
          {/* Sort controls */}
          <SortBar basePath={basePath} previewId={previewId} query={query} />
          {/* Active filters */}
          <div className="flex flex-wrap gap-1">
            {query.provider && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{query.provider}</span>
            )}
            {query.project && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{query.project}</span>
            )}
            {query.status && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{query.status}</span>
            )}
            {(query.provider || query.project || query.status || query.q) && (
              <a className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground" href={`${basePath}${qs({ hideSubagents: query.hideSubagents })}`}>
                clear
              </a>
            )}
          </div>
        </div>

        {/* Card list */}
        <div className="flex-1 divide-y divide-[hsl(var(--sidebar-border))] overflow-y-auto">
          {result.items.length > 0 ? (
            result.items.map((row) => {
              const isSelected = row.id === previewId;
              return (
                <a
                  className={`flex items-start gap-2 px-3 py-2.5 transition-colors ${isSelected ? "bg-[hsl(var(--sidebar-active))]" : "hover:bg-[hsl(var(--sidebar-hover))]"}`}
                  href={previewHref(row.id)}
                  key={row.id}
                >
                  <StatusDot status={row.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className={`truncate text-[12px] font-medium ${isSelected ? "text-blue-700" : "text-[hsl(var(--sidebar-fg))]"}`}>
                        {row.title ?? "(untitled)"}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-[hsl(var(--sidebar-muted))]">
                        {row.updatedAt?.slice(5, 10) ?? ""}
                      </span>
                    </div>
                    {(row.initialPromptPreview ?? row.summary) && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[hsl(var(--sidebar-muted))]">
                        {row.initialPromptPreview ?? row.summary}
                      </div>
                    )}
                  </div>
                </a>
              );
            })
          ) : (
            <div className="px-3 py-6 text-center text-[12px] text-[hsl(var(--sidebar-muted))]">No threads found.</div>
          )}
        </div>

        {/* Pagination */}
        <div
          className="flex shrink-0 flex-col gap-0.5 px-3 py-2 text-[11px] text-[hsl(var(--sidebar-muted))]"
          style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
        >
          <div className="flex items-center justify-between">
            <span>{result.total} threads</span>
            <div className="flex items-center gap-2">
              {result.page > 1 && (
                <a className="hover:text-foreground" href={`${basePath}${qs({ ...query, preview: previewId, page: result.page - 1 })}`}>←</a>
              )}
              <span>{result.page}/{totalPages}</span>
              {result.page < totalPages && (
                <a className="hover:text-foreground" href={`${basePath}${qs({ ...query, preview: previewId, page: result.page + 1 })}`}>→</a>
              )}
            </div>
          </div>
          {query.hideSubagents !== false && (
            <div className="text-[10px] text-violet-500">
              sub-agents hidden ·{" "}
              <a className="underline hover:text-violet-700" href={`${basePath}${qs({ ...query, hideSubagents: false, page: 1, preview: previewId })}`}>show</a>
            </div>
          )}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-card">
        {previewDetail ? (
          <ThreadPreviewContent detail={previewDetail} relatedThreads={relatedThreads} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="text-[13px]">Select a thread to preview</span>
            <span className="text-[11px]">or press ⌘K to search</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadsPage(
  props: ShellProps & {
    result: ThreadListResult;
    query: ThreadListQuery;
    notice?: string | null;
    previewId?: string | null;
    previewDetail?: ThreadDetail | null;
    relatedThreads?: SearchResult[];
  },
): ReactNode {
  return (
    <AppShell {...props} fullBleed title="All Threads">
      <ThreadSplitLayout
        basePath="/threads"
        previewDetail={props.previewDetail ?? null}
        previewId={props.previewId ?? null}
        projects={props.projects}
        providers={props.providers}
        query={props.query}
        relatedThreads={props.relatedThreads}
        result={props.result}
      />
    </AppShell>
  );
}

function ThreadListPanel({
  projects,
  providers,
  query,
  result,
  basePath = "/threads",
}: {
  projects: Array<{ projectName: string; count: number }>;
  providers: Array<{ providerId: string; count: number }>;
  query: ThreadListQuery;
  result: ThreadListResult;
  basePath?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <Card>
      <CardSection>
        <div className="text-sm text-muted-foreground">
          Unified thread index across supported providers. Richest detail is currently available for Codex and Claude Code.
        </div>
      </CardSection>
      <CardSection>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <form
            action={basePath}
            className="flex flex-1 flex-wrap items-center gap-2"
            data-auto-submit="true"
            method="get"
          >
            <input name="page" type="hidden" value="1" />
            <Input className="min-w-[240px] flex-1 xl:max-w-[320px]" defaultValue={query.q ?? ""} name="q" placeholder="Search title or prompt" />
            <Select className="w-[180px]" defaultValue={query.provider ?? ""} name="provider">
              <option value="">All providers</option>
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.providerId}
                </option>
              ))}
            </Select>
            <Select className="w-[200px]" defaultValue={query.project ?? ""} name="project">
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.projectName} value={project.projectName}>
                  {project.projectName}
                </option>
              ))}
            </Select>
            <Select className="w-[160px]" defaultValue={query.status ?? ""} name="status">
              <option value="">All statuses</option>
              {["ok", "partial", "error", "orphaned"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
            <Select className="w-[124px]" defaultValue={String(query.pageSize)} name="pageSize">
              {[25, 50, 100, 250].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
            <a href={basePath}>
              <Button type="button" variant="secondary">
                Reset
              </Button>
            </a>
          </form>
          {query.provider || query.project || query.status || query.q ? (
            <form action="/actions/save-filter" className="flex items-center gap-2" method="post">
              <input name="href" type="hidden" value={`${basePath}${qs({ ...query, page: 1 })}`} />
              <input
                name="name"
                type="hidden"
                value={
                  query.q
                    ? `Search: ${query.q}`
                    : query.project
                      ? `Project: ${query.project}`
                      : query.provider
                        ? `Provider: ${query.provider}`
                        : `Status: ${query.status}`
                }
              />
              <Button type="submit" variant="secondary">
                Save Filter
              </Button>
            </form>
          ) : null}
        </div>
      </CardSection>
      <div className="divide-y divide-border">
        {result.items.length > 0 ? (
          result.items.map((row) => (
            <a
              className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-accent"
              href={`/threads/${row.id}`}
              key={row.id}
            >
              <StatusDot status={row.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {row.title ?? "(untitled)"}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {row.updatedAt?.slice(0, 10) ?? ""}
                  </span>
                </div>
                {(row.initialPromptPreview ?? row.summary) && (
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {row.initialPromptPreview ?? row.summary}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1 py-0.5 font-mono">{row.providerId}</span>
                  {row.projectName && <span className="truncate">{row.projectName}</span>}
                  <span className="ml-auto tabular-nums">{row.messageCount} msgs</span>
                </div>
              </div>
            </a>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No indexed threads matched this filter set.
          </div>
        )}
      </div>
      <CardSection className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {result.items.length} of {result.total} threads
        </div>
        <div className="flex flex-wrap gap-2">
          {result.page > 1 ? (
            <a href={`${basePath}${qs({ ...query, page: result.page - 1 })}`}>
              <Button size="sm" type="button" variant="secondary">
                Previous
              </Button>
            </a>
          ) : null}
          <Badge>
            Page {result.page} of {totalPages}
          </Badge>
          {result.page < totalPages ? (
            <a href={`${basePath}${qs({ ...query, page: result.page + 1 })}`}>
              <Button size="sm" type="button" variant="secondary">
                Next
              </Button>
            </a>
          ) : null}
        </div>
      </CardSection>
    </Card>
  );
}

export function ThreadDetailPage(props: ShellProps & { detail: ThreadDetail; relatedThreads?: SearchResult[] }): ReactNode {
  const { thread, messages, sources, issues } = props.detail;
  const capabilities = thread.capabilitiesJson ? (JSON.parse(thread.capabilitiesJson) as Record<string, boolean>) : {};

  const wordCount = messages.reduce((sum, m) => {
    const text = m.contentText ?? m.contentPreview ?? "";
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  return (
    <AppShell {...props} backHref="/threads" title={thread.title ?? "Thread Detail"}>
      {/* Three-column layout: timeline | props panel */}
      <div className="flex min-h-0 gap-0 -m-5">
        {/* Timeline — main scrollable column */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={thread.status} />
              <Badge>{thread.providerId}</Badge>
              {thread.isArchived ? <Badge>archived</Badge> : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{thread.title ?? "(untitled)"}</h2>
            {(thread.initialPromptPreview ?? thread.summary) && (
              <div className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {thread.initialPromptPreview ?? thread.summary}
              </div>
            )}
          </div>

          {/* Initial prompt */}
          {thread.initialPrompt && (
            <Card className="mb-4">
              <CardSection>
                <div className="mb-2 flex items-center gap-1.5">
                  <FileText size={12} className="text-blue-600" />
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Initial Prompt</div>
                </div>
                <MarkdownBody collapsible text={thread.initialPrompt} />
              </CardSection>
            </Card>
          )}

          {/* Message timeline */}
          <Timeline capabilities={capabilities} messages={messages} />
        </div>

        {/* Properties panel */}
        <aside
          className="w-[260px] shrink-0 overflow-y-auto bg-[hsl(var(--sidebar-bg))] py-5"
          style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
        >
          <div className="space-y-5 px-4">
            {/* Type & Status */}
            <div className="space-y-3">
              <PropRow label="Type">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{thread.providerId}</span>
              </PropRow>
              <PropRow label="Status">
                <StatusBadge status={thread.status} />
              </PropRow>
            </div>

            <div className="border-t border-[hsl(var(--sidebar-border))]" />

            {/* Dates */}
            <div className="space-y-3">
              <PropRow label="Created">{thread.createdAt ?? "—"}</PropRow>
              <PropRow label="Modified">{thread.updatedAt ?? "—"}</PropRow>
            </div>

            <div className="border-t border-[hsl(var(--sidebar-border))]" />

            {/* Counts */}
            <div className="space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Info</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                {[
                  ["Messages", thread.messageCount],
                  ["~Words", wordCount > 0 ? wordCount.toLocaleString() : "—"],
                  ["User", thread.userMessageCount],
                  ["Assistant", thread.assistantMessageCount],
                  ["Tool calls", thread.toolCallCount],
                  ["Errors", thread.errorCount],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <div className="text-[10px] text-muted-foreground">{label}</div>
                    <div className="text-[13px] font-medium tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Project */}
            {thread.projectName && (
              <>
                <div className="border-t border-[hsl(var(--sidebar-border))]" />
                <PropRow label="Project">{thread.projectName}</PropRow>
              </>
            )}

            {/* Repo */}
            {(thread.repoPath ?? thread.cwd) && (
              <PropRow label="Repo / cwd">
                <span className="break-all font-mono text-[11px]">{thread.repoPath ?? thread.cwd}</span>
              </PropRow>
            )}

            {/* Related threads */}
            {props.relatedThreads && props.relatedThreads.length > 0 && (
              <>
                <div className="border-t border-[hsl(var(--sidebar-border))]" />
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Related To</div>
                  {props.relatedThreads.map((r) => (
                    <a
                      className="block rounded-md bg-[hsl(var(--sidebar-hover))] px-2.5 py-2 hover:bg-[hsl(var(--sidebar-active))]"
                      href={`/threads/${r.threadId}`}
                      key={r.threadId}
                    >
                      <div className="line-clamp-2 text-[12px] leading-snug text-foreground">
                        {searchResultHeadline(r.threadTitle, r.initialPromptPreview, r.firstUserSnippet)}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.provider} · {r.score.toFixed(2)}
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Sources */}
            {sources.length > 0 && (
              <>
                <div className="border-t border-[hsl(var(--sidebar-border))]" />
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sources</div>
                  {sources.map((s) => (
                    <div className="rounded-md bg-[hsl(var(--sidebar-hover))] px-2.5 py-2" key={`${s.sourceRole}-${s.sourcePath}`}>
                      <div className="break-all font-mono text-[11px]">{s.sourcePath}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{s.sourceRole}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Parse issues */}
            {issues.length > 0 && (
              <>
                <div className="border-t border-[hsl(var(--sidebar-border))]" />
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Parse Issues · {issues.length}
                  </div>
                  {issues.map((entry, i) => (
                    <div className="rounded-md bg-[hsl(var(--sidebar-hover))] px-2.5 py-2" key={`${entry.code}-${i}`}>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={entry.severity} />
                        <span className="font-mono text-[10px] text-muted-foreground">{entry.code}</span>
                      </div>
                      <div className="mt-1 text-[12px]">{entry.message}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">×{entry.count}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Thread ID */}
            <div className="border-t border-[hsl(var(--sidebar-border))]" />
            <PropRow label="Provider Thread ID">
              <span className="break-all font-mono text-[11px]">{thread.providerThreadId}</span>
            </PropRow>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

type ScopedSplitProps = ShellProps & {
  summary: GroupSummaryRow;
  threads: ThreadListResult;
  query: ThreadListQuery;
  previewId: string | null;
  previewDetail: ThreadDetail | null;
  relatedThreads?: SearchResult[];
};

export function ProviderPage(props: ScopedSplitProps) {
  const basePath = `/providers/${encodeURIComponent(props.summary.name)}`;
  return (
    <AppShell {...props} fullBleed title={props.summary.name}>
      <ThreadSplitLayout
        basePath={basePath}
        previewDetail={props.previewDetail}
        previewId={props.previewId}
        projects={props.projects}
        providers={props.providers}
        query={props.query}
        relatedThreads={props.relatedThreads}
        result={props.threads}
        scopeInfo={`${props.summary.count} threads · ${props.summary.okCount} ok · ${props.summary.partialCount} partial`}
      />
    </AppShell>
  );
}

export function ProjectPage(props: ScopedSplitProps) {
  const basePath = `/projects/${encodeURIComponent(props.summary.name)}`;
  return (
    <AppShell {...props} fullBleed title={props.summary.name}>
      <ThreadSplitLayout
        basePath={basePath}
        previewDetail={props.previewDetail}
        previewId={props.previewId}
        projects={props.projects}
        providers={props.providers}
        query={props.query}
        relatedThreads={props.relatedThreads}
        result={props.threads}
        scopeInfo={`${props.summary.count} threads · ${props.summary.okCount} ok · ${props.summary.partialCount} partial`}
      />
    </AppShell>
  );
}

function DiagnosticsTablePage(props: ShellProps & { title: string; children: ReactNode }) {
  return (
    <AppShell {...props} title={props.title}>
      <Card>{props.children}</Card>
    </AppShell>
  );
}

export function IssuesPage(props: ShellProps & { rows: ParseIssueRow[] }) {
  return (
    <DiagnosticsTablePage {...props} title="Parse Issues">
      <CardSection>
        <h3 className="text-lg font-semibold tracking-tight">
          Parse Issues
        </h3>
      </CardSection>
      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th>Provider</Th>
              <Th>Severity</Th>
              <Th>Code</Th>
              <Th>Message</Th>
              <Th>Count</Th>
              <Th>Last seen</Th>
            </Tr>
          </thead>
          <tbody>
            {props.rows.length > 0 ? (
              props.rows.map((row, index) => (
                <Tr key={`${row.code}-${index}`}>
                  <Td>{row.providerId}</Td>
                  <Td>
                    <StatusBadge status={row.severity} />
                  </Td>
                  <Td className="font-mono text-xs">{row.code}</Td>
                  <Td>{row.message}</Td>
                  <Td>{row.count}</Td>
                  <Td>{row.lastSeenAt}</Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td className="empty" colSpan={6}>
                  <div className="py-4 text-muted-foreground">
                  No parse issues recorded.
                  </div>
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
    </DiagnosticsTablePage>
  );
}

export function RootsPage(props: ShellProps & { rows: SourceRootRow[] }) {
  return (
    <DiagnosticsTablePage {...props} title="Source Roots">
      <CardSection>
        <h3 className="text-lg font-semibold tracking-tight">
          Source Roots
        </h3>
      </CardSection>
      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th>Provider</Th>
              <Th>Path</Th>
              <Th>Status</Th>
              <Th>Last scanned</Th>
              <Th>Notes</Th>
            </Tr>
          </thead>
          <tbody>
            {props.rows.length > 0 ? (
              props.rows.map((row, index) => (
                <Tr key={`${row.providerId}-${row.path}-${index}`}>
                  <Td>{row.providerId}</Td>
                  <Td className="font-mono text-xs">{row.path}</Td>
                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>
                  <Td>{row.lastScannedAt ?? ""}</Td>
                  <Td>{row.notes ?? ""}</Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td className="empty" colSpan={5}>
                  <div className="py-4 text-muted-foreground">
                  No roots have been scanned yet.
                  </div>
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
    </DiagnosticsTablePage>
  );
}

export function RunsPage(props: ShellProps & { rows: IndexRunRow[] }) {
  return (
    <DiagnosticsTablePage {...props} title="Index Runs">
      <CardSection>
        <h3 className="text-lg font-semibold tracking-tight">
          Index Runs
        </h3>
      </CardSection>
      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th>Started</Th>
              <Th>Completed</Th>
              <Th>Status</Th>
              <Th>Providers</Th>
              <Th>Files changed</Th>
              <Th>Threads</Th>
              <Th>Messages</Th>
              <Th>Errors</Th>
            </Tr>
          </thead>
          <tbody>
            {props.rows.length > 0 ? (
              props.rows.map((row, index) => (
                <Tr key={`${row.startedAt}-${index}`}>
                  <Td>{row.startedAt}</Td>
                  <Td>{row.completedAt ?? ""}</Td>
                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>
                  <Td className="font-mono text-xs">{row.providersJson}</Td>
                  <Td>{row.filesChanged}</Td>
                  <Td>{row.threadsUpserted}</Td>
                  <Td>{row.messagesUpserted}</Td>
                  <Td>{row.errors}</Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td className="empty" colSpan={8}>
                  <div className="py-4 text-muted-foreground">
                  No index runs recorded.
                  </div>
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
    </DiagnosticsTablePage>
  );
}

function ConfigFieldRow({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-x-4 gap-y-1 py-3 border-b border-border last:border-b-0">
      <div className="pt-1.5">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="config-field-cell">
        {children}
        {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-muted/40 border-b border-border">
        {title}
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function ProviderSection({
  id, label, enabled, roots, errors,
}: {
  id: string;
  label: string;
  enabled: boolean;
  roots: string[];
  errors?: Record<string, string>;
}) {
  const prefix = `providers.${id}`;
  const ve = errors ?? {};
  return (
    <ConfigSection title={label}>
      <ConfigFieldRow label="Enabled">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            className="h-4 w-4 rounded border-border"
            defaultChecked={enabled}
            name={`${prefix}.enabled`}
            type="checkbox"
            value="1"
          />
          <span className="text-[13px] text-foreground">Enable {label} provider</span>
        </label>
      </ConfigFieldRow>
      <ConfigFieldRow label="Root paths" hint="One path per line" error={ve[`${prefix}.roots`]}>
        <textarea
          className={`w-full rounded-md border bg-background px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring ${ve[`${prefix}.roots`] ? "border-rose-400 ring-1 ring-rose-200" : "border-border"}`}
          data-validate="abspaths"
          defaultValue={roots.join("\n")}
          name={`${prefix}.roots`}
          rows={Math.max(2, roots.length + 1)}
        />
      </ConfigFieldRow>
    </ConfigSection>
  );
}

type FlatValues = {
  dbPath?: string;
  server?: { host?: string; port?: string };
  providers?: {
    codex?: { enabled?: boolean; roots?: string[] };
    claudeCode?: { enabled?: boolean; roots?: string[] };
    cursor?: { enabled?: boolean; roots?: string[] };
  };
  indexing?: { messageFts?: boolean; batchSize?: string; maxPreviewLength?: string };
  watch?: { enabled?: boolean; debounceMs?: string };
  excludes?: string[];
  semanticSearch?: { enabled?: boolean; model?: string; mode?: string; chunkSize?: string; chunkOverlap?: string; enableFts?: boolean };
};

export function SettingsPage(props: ShellProps & {
  notice?: string | null;
  validationErrors?: Record<string, string>;
  flatValues?: FlatValues;
  jsonError?: string;
  rawJsonValue?: string;
}) {
  const { config } = props;
  const ve = props.validationErrors ?? {};
  const fv = props.flatValues;

  // Helpers to pick submitted value or fall back to current config
  const sv = (submitted: string | undefined, fallback: string) => submitted ?? fallback;
  const bv = (submitted: boolean | undefined, fallback: boolean) => submitted ?? fallback;

  // Which tab to open: JSON if there's a JSON error or rawJsonValue, else Form
  const openTab = props.jsonError || props.rawJsonValue ? "json" : "form";

  // Helper: apply error border class to an input/textarea
  const errCls = (key: string) =>
    ve[key] ? "border-rose-400 ring-1 ring-rose-200" : "border-input";

  return (
    <AppShell {...props} title="Settings">
      {props.notice && <Notice message={props.notice} />}

      <Card>
        <CardSection>
          <h3 className="text-lg font-semibold tracking-tight">Index Actions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action="/actions/reindex" method="post">
              <Button type="submit">Refresh All Providers</Button>
            </form>
            <form action="/actions/reindex/provider/codex" method="post">
              <Button type="submit" variant="secondary">Reindex Codex</Button>
            </form>
            <form action="/actions/reindex/provider/claude-code" method="post">
              <Button type="submit" variant="secondary">Reindex Claude Code</Button>
            </form>
            <form action="/actions/reindex/provider/cursor" method="post">
              <Button type="submit" variant="secondary">Reindex Cursor</Button>
            </form>
          </div>
        </CardSection>
      </Card>

      <Card>
        {/* Tab bar */}
        <CardSection>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight">Configuration</h3>
            <div className="flex items-center gap-1" id="config-tab-bar">
              {(["form", "json"] as const).map((tab) => (
                <button
                  className={`config-tab-btn rounded px-3 py-1 text-[12px] transition-colors ${tab === openTab ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-tab={tab}
                  key={tab}
                  type="button"
                >
                  {tab === "form" ? "Form" : "Raw JSON"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Saved to <span className="font-mono">~/.config/agent-index/config.json</span>. Changes take effect on next restart.
          </p>
        </CardSection>

        {/* Form tab */}
        <div className={openTab === "json" ? "hidden" : ""} id="config-tab-form">
          <form action="/actions/save-config" id="config-form" method="post" noValidate>
            <input name="_tab" type="hidden" value="form" />

            <ConfigSection title="Database">
              <ConfigFieldRow label="DB path" hint="Absolute path to the SQLite database file" error={ve["dbPath"]}>
                <Input
                  className={errCls("dbPath")}
                  data-validate="abspath"
                  defaultValue={sv(fv?.dbPath, config.dbPath)}
                  name="dbPath"
                  required
                />
              </ConfigFieldRow>
            </ConfigSection>

            <ConfigSection title="Server">
              <ConfigFieldRow label="Host" hint="Hostname or IP address (e.g. 127.0.0.1, localhost)" error={ve["server.host"]}>
                <Input
                  className={errCls("server.host")}
                  data-validate="host"
                  defaultValue={sv(fv?.server?.host, config.server.host)}
                  name="server.host"
                  required
                />
              </ConfigFieldRow>
              <ConfigFieldRow label="Port" error={ve["server.port"]}>
                <Input
                  className={errCls("server.port")}
                  defaultValue={sv(fv?.server?.port, String(config.server.port))}
                  max="65535"
                  min="1"
                  name="server.port"
                  required
                  type="number"
                />
              </ConfigFieldRow>
            </ConfigSection>

            <ProviderSection
              enabled={bv(fv?.providers?.codex?.enabled, config.providers.codex.enabled)}
              errors={ve}
              id="codex"
              label="Codex"
              roots={fv?.providers?.codex?.roots ?? config.providers.codex.roots}
            />
            <ProviderSection
              enabled={bv(fv?.providers?.claudeCode?.enabled, config.providers.claudeCode.enabled)}
              errors={ve}
              id="claudeCode"
              label="Claude Code"
              roots={fv?.providers?.claudeCode?.roots ?? config.providers.claudeCode.roots}
            />
            <ProviderSection
              enabled={bv(fv?.providers?.cursor?.enabled, config.providers.cursor.enabled)}
              errors={ve}
              id="cursor"
              label="Cursor"
              roots={fv?.providers?.cursor?.roots ?? config.providers.cursor.roots}
            />

            <ConfigSection title="Indexing">
              <ConfigFieldRow label="Message FTS" hint="Full-text search on message bodies">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    className="h-4 w-4 rounded border-border"
                    defaultChecked={bv(fv?.indexing?.messageFts, config.indexing.messageFts)}
                    name="indexing.messageFts"
                    type="checkbox"
                    value="1"
                  />
                  <span className="text-[13px] text-foreground">Enable</span>
                </label>
              </ConfigFieldRow>
              <ConfigFieldRow label="Batch size" error={ve["indexing.batchSize"]}>
                <Input
                  className={errCls("indexing.batchSize")}
                  defaultValue={sv(fv?.indexing?.batchSize, String(config.indexing.batchSize))}
                  min="1"
                  name="indexing.batchSize"
                  required
                  type="number"
                />
              </ConfigFieldRow>
              <ConfigFieldRow label="Max preview length" hint="Characters" error={ve["indexing.maxPreviewLength"]}>
                <Input
                  className={errCls("indexing.maxPreviewLength")}
                  defaultValue={sv(fv?.indexing?.maxPreviewLength, String(config.indexing.maxPreviewLength))}
                  min="1"
                  name="indexing.maxPreviewLength"
                  required
                  type="number"
                />
              </ConfigFieldRow>
            </ConfigSection>

            <ConfigSection title="File Watcher">
              <ConfigFieldRow label="Enabled">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    className="h-4 w-4 rounded border-border"
                    defaultChecked={bv(fv?.watch?.enabled, config.watch?.enabled ?? false)}
                    name="watch.enabled"
                    type="checkbox"
                    value="1"
                  />
                  <span className="text-[13px] text-foreground">Watch for file changes</span>
                </label>
              </ConfigFieldRow>
              <ConfigFieldRow label="Debounce" hint="Milliseconds" error={ve["watch.debounceMs"]}>
                <Input
                  className={errCls("watch.debounceMs")}
                  defaultValue={sv(fv?.watch?.debounceMs, String(config.watch?.debounceMs ?? 500))}
                  min="0"
                  name="watch.debounceMs"
                  required
                  type="number"
                />
              </ConfigFieldRow>
            </ConfigSection>

            <ConfigSection title="Excludes">
              <ConfigFieldRow label="Excluded patterns" hint="One glob pattern per line">
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  defaultValue={(fv?.excludes ?? config.excludes ?? []).join("\n")}
                  name="excludes"
                  rows={Math.max(3, (config.excludes ?? []).length + 1)}
                />
              </ConfigFieldRow>
            </ConfigSection>

            <ConfigSection title="Semantic Search">
              <ConfigFieldRow label="Enabled">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    className="h-4 w-4 rounded border-border"
                    defaultChecked={bv(fv?.semanticSearch?.enabled, config.semanticSearch.enabled)}
                    name="semanticSearch.enabled"
                    type="checkbox"
                    value="1"
                  />
                  <span className="text-[13px] text-foreground">Enable semantic search</span>
                </label>
              </ConfigFieldRow>
              <ConfigFieldRow label="Model" error={ve["semanticSearch.model"]}>
                <Input
                  className={errCls("semanticSearch.model")}
                  defaultValue={sv(fv?.semanticSearch?.model, config.semanticSearch.model)}
                  name="semanticSearch.model"
                  required
                />
              </ConfigFieldRow>
              <ConfigFieldRow label="Mode">
                <Select defaultValue={fv?.semanticSearch?.mode ?? config.semanticSearch.mode} name="semanticSearch.mode">
                  <option value="hybrid">Hybrid</option>
                  <option value="semantic">Semantic only</option>
                  <option value="keyword">Keyword only</option>
                </Select>
              </ConfigFieldRow>
              <ConfigFieldRow label="Chunk size" hint="Tokens per chunk" error={ve["semanticSearch.chunkSize"]}>
                <Input
                  className={errCls("semanticSearch.chunkSize")}
                  defaultValue={sv(fv?.semanticSearch?.chunkSize, String(config.semanticSearch.chunkSize))}
                  min="1"
                  name="semanticSearch.chunkSize"
                  required
                  type="number"
                />
              </ConfigFieldRow>
              <ConfigFieldRow label="Chunk overlap" hint="Tokens of overlap" error={ve["semanticSearch.chunkOverlap"]}>
                <Input
                  className={errCls("semanticSearch.chunkOverlap")}
                  defaultValue={sv(fv?.semanticSearch?.chunkOverlap, String(config.semanticSearch.chunkOverlap))}
                  min="0"
                  name="semanticSearch.chunkOverlap"
                  required
                  type="number"
                />
              </ConfigFieldRow>
              <ConfigFieldRow label="FTS fallback">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    className="h-4 w-4 rounded border-border"
                    defaultChecked={bv(fv?.semanticSearch?.enableFts, config.semanticSearch.enableFts)}
                    name="semanticSearch.enableFts"
                    type="checkbox"
                    value="1"
                  />
                  <span className="text-[13px] text-foreground">Enable FTS fallback</span>
                </label>
              </ConfigFieldRow>
            </ConfigSection>

            <CardSection>
              <Button type="submit">Save Configuration</Button>
            </CardSection>
          </form>
        </div>

        {/* Raw JSON tab */}
        <div className={openTab === "form" ? "hidden" : ""} id="config-tab-json">
          {props.jsonError && (
            <div className="mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {props.jsonError}
            </div>
          )}
          <div className="hidden mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700" id="config-json-error" role="alert" aria-live="polite" />
          <form action="/actions/save-config" id="config-json-form" method="post" noValidate>
            <input name="_tab" type="hidden" value="json" />
            <CardSection>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                id="config-raw-json"
                name="rawJson"
                rows={30}
                defaultValue={props.rawJsonValue ?? JSON.stringify(config, null, 2)}
              />
            </CardSection>
            <CardSection>
              <Button type="submit">Save JSON</Button>
            </CardSection>
          </form>
        </div>
      </Card>

      <style dangerouslySetInnerHTML={{ __html: `
        .config-field-invalid {
          border-color: #f87171 !important;
          box-shadow: 0 0 0 2px rgb(248 113 113 / 0.18) !important;
        }
        .config-field-error {
          margin-top: 4px;
          font-size: 11px;
          color: #dc2626;
          display: none;
        }
        .config-field-error.visible { display: block; }
      ` }} />

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              // ── Tab switching ──────────────────────────────────────────────
              const bar = document.getElementById("config-tab-bar");
              const panels = { form: document.getElementById("config-tab-form"), json: document.getElementById("config-tab-json") };
              bar.addEventListener("click", function(e) {
                const btn = e.target.closest(".config-tab-btn");
                if (!btn) return;
                const tab = btn.dataset.tab;
                for (const b of bar.querySelectorAll(".config-tab-btn")) {
                  const active = b.dataset.tab === tab;
                  b.classList.toggle("bg-muted", active);
                  b.classList.toggle("font-medium", active);
                  b.classList.toggle("text-foreground", active);
                  b.classList.toggle("text-muted-foreground", !active);
                }
                for (const [key, panel] of Object.entries(panels)) {
                  panel.classList.toggle("hidden", key !== tab);
                }
              });

              // ── Semantic validation rules (mirrors Zod schema) ─────────────
              const IPV4 = /^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$/;
              const IPV6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:)*:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}|::1|::)$/;
              const LABEL = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

              function isValidHost(v) {
                if (!v) return true; // empty handled by "required"
                if (IPV4.test(v) || IPV6.test(v)) return true;
                const labels = v.split(".");
                if (labels.some(l => /^\\d+$/.test(l))) return false;
                return labels.every(l => LABEL.test(l));
              }

              function isAbsPath(v) {
                return !v || v === "~" || v.startsWith("/") || v.startsWith("~/");
              }

              // Set or clear custom validity based on data-validate
              function semanticCheck(input) {
                const rule = input.dataset.validate;
                if (!rule) return;
                const v = input.value;

                if (rule === "host") {
                  input.setCustomValidity(isValidHost(v) ? "" : "Must be a valid hostname or IP address (e.g. 127.0.0.1, localhost)");
                } else if (rule === "abspath") {
                  input.setCustomValidity(isAbsPath(v) ? "" : "Must be an absolute path (starting with / or ~/)");
                } else if (rule === "abspaths") {
                  const bad = v.split("\\n").map(s => s.trim()).filter(Boolean).find(p => !isAbsPath(p));
                  input.setCustomValidity(bad ? \`"\${bad}" is not an absolute path\` : "");
                }
              }

              // ── Per-field validation UI ────────────────────────────────────
              function getErrorEl(input) {
                const cell = input.closest(".config-field-cell");
                let el = cell && cell.querySelector(".config-field-error");
                if (!el) {
                  el = document.createElement("p");
                  el.className = "config-field-error";
                  input.insertAdjacentElement("afterend", el);
                }
                return el;
              }

              function fieldMessage(input) {
                const v = input.validity;
                if (v.valid) return "";
                if (v.customError) return input.validationMessage;
                if (v.valueMissing) return "Required";
                if (v.rangeUnderflow) return "Must be at least " + input.min;
                if (v.rangeOverflow) return "Must be at most " + input.max;
                if (v.stepMismatch) return "Must be a whole number";
                return input.validationMessage || "Invalid value";
              }

              function validateInput(input) {
                if (input.type === "checkbox" || input.type === "hidden") return true;
                semanticCheck(input);
                const msg = fieldMessage(input);
                const errEl = getErrorEl(input);
                if (msg) {
                  input.classList.add("config-field-invalid");
                  errEl.textContent = msg;
                  errEl.classList.add("visible");
                  return false;
                } else {
                  input.classList.remove("config-field-invalid");
                  errEl.textContent = "";
                  errEl.classList.remove("visible");
                  return true;
                }
              }

              // ── Form events ────────────────────────────────────────────────
              const form = document.getElementById("config-form");

              // On submit: validate all fields
              form.addEventListener("submit", function(e) {
                const fields = Array.from(form.elements).filter(el =>
                  (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
                  el.type !== "checkbox" && el.type !== "hidden"
                );
                const invalid = fields.filter(el => !validateInput(el));
                if (invalid.length > 0) {
                  e.preventDefault();
                  invalid[0].focus();
                  invalid[0].scrollIntoView({ block: "center", behavior: "smooth" });
                }
              });

              // On blur: always validate the field that lost focus
              form.addEventListener("blur", function(e) {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                  validateInput(e.target);
                }
              }, true);

              // On input: always re-validate (live feedback)
              form.addEventListener("input", function(e) {
                const el = e.target;
                if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
                if (el.type === "checkbox" || el.type === "hidden") return;
                // Only run live if field has been touched (has error class) OR has a semantic rule
                if (el.classList.contains("config-field-invalid") || el.dataset.validate) {
                  validateInput(el);
                }
              });

              // ── JSON tab validation ────────────────────────────────────────
              const jsonForm = document.getElementById("config-json-form");
              const jsonTextarea = document.getElementById("config-raw-json");
              const jsonError = document.getElementById("config-json-error");

              jsonForm.addEventListener("submit", function(e) {
                jsonError.classList.add("hidden");
                jsonTextarea.classList.remove("config-field-invalid");
                try {
                  JSON.parse(jsonTextarea.value);
                } catch (err) {
                  e.preventDefault();
                  jsonError.textContent = "Invalid JSON: " + err.message;
                  jsonError.classList.remove("hidden");
                  jsonTextarea.classList.add("config-field-invalid");
                  jsonTextarea.focus();
                }
              });

              jsonTextarea.addEventListener("input", function() {
                try {
                  JSON.parse(jsonTextarea.value);
                  jsonTextarea.classList.remove("config-field-invalid");
                  jsonError.classList.add("hidden");
                } catch {
                  jsonTextarea.classList.add("config-field-invalid");
                }
              });
            })();
          `,
        }}
      />
    </AppShell>
  );
}

export function NotFoundPage(props: ShellProps) {
  return (
    <AppShell {...props} title="Not Found">
      <Card>
        <CardSection>
          <div className="empty">The requested page was not found.</div>
        </CardSection>
      </Card>
    </AppShell>
  );
}

function MatchedByPill({ matchedBy }: { matchedBy: string }) {
  const styles: Record<string, string> = {
    hybrid:   "bg-violet-100 text-violet-700",
    semantic: "bg-blue-100 text-blue-700",
    keyword:  "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${styles[matchedBy] ?? "bg-muted text-muted-foreground"}`}>
      {matchedBy}
    </span>
  );
}

export function SearchPage(
  props: ShellProps & {
    q: string;
    mode: SearchMode;
    provider?: string | null;
    project?: string | null;
    results: SearchResult[];
    semanticEnabled: boolean;
  },
) {
  return (
    <AppShell {...props} title="Search">
      <Card>
        {/* Search bar */}
        <CardSection>
          <form action="/search" className="flex flex-wrap items-center gap-2" data-auto-submit="true" method="get">
            <input name="page" type="hidden" value="1" />
            <Input className="min-w-[240px] flex-1" defaultValue={props.q} name="q" placeholder="Search conversations…" />
            <Select className="w-[150px]" defaultValue={props.mode} name="mode">
              <option value="hybrid">Hybrid</option>
              <option value="semantic">Semantic only</option>
              <option value="keyword">Keyword only</option>
            </Select>
            <Select className="w-[160px]" defaultValue={props.provider ?? ""} name="provider">
              <option value="">All providers</option>
              {props.providers.map((p) => (
                <option key={p.providerId} value={p.providerId}>{p.providerId}</option>
              ))}
            </Select>
            <Select className="w-[180px]" defaultValue={props.project ?? ""} name="project">
              <option value="">All projects</option>
              {props.projects.map((p) => (
                <option key={p.projectName} value={p.projectName}>{p.projectName}</option>
              ))}
            </Select>
          </form>
          {!props.semanticEnabled && (
            <div className="mt-2 text-[11px] text-amber-600">Semantic search disabled — showing keyword results only.</div>
          )}
        </CardSection>

        {/* Results */}
        {props.results.length > 0 ? (
          <>
            <div className="border-b border-border px-4 py-2">
              <span className="text-[11px] text-muted-foreground">
                {props.results.length} result{props.results.length !== 1 ? "s" : ""} for{" "}
                <strong className="font-semibold text-foreground">{props.q}</strong>
              </span>
            </div>
            <div className="divide-y divide-border">
              {props.results.map((r) => {
                const headline = searchResultHeadline(r.threadTitle, r.initialPromptPreview, r.firstUserSnippet);
                return (
                  <a
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[hsl(var(--sidebar-hover))]"
                    href={`/threads?preview=${encodeURIComponent(r.threadId)}`}
                    key={r.chunkId}
                  >
                    <StatusDot status="ok" />
                    <div className="min-w-0 flex-1">
                      {/* Title row */}
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-[hsl(var(--sidebar-fg))]">
                          {headline}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <MatchedByPill matchedBy={r.matchedBy} />
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{r.score.toFixed(2)}</span>
                        </div>
                      </div>
                      {/* Provider + project chips */}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{r.provider}</span>
                        {r.projectName && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{r.projectName}</span>
                        )}
                      </div>
                      {/* Snippet */}
                      {r.contentPreview && (
                        <div className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {r.contentPreview}
                        </div>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </>
        ) : props.q ? (
          <CardSection>
            <div className="py-4 text-[13px] text-muted-foreground">
              No results found for <strong className="font-semibold text-foreground">{props.q}</strong>.
            </div>
          </CardSection>
        ) : (
          <CardSection>
            <div className="text-[12px] text-muted-foreground">
              {props.semanticEnabled
                ? "Search across all indexed message content using semantic, keyword, or hybrid retrieval."
                : "Enter a query to search indexed conversations."}
            </div>
          </CardSection>
        )}
      </Card>
    </AppShell>
  );
}

export function SemanticDiagnosticsPage(
  props: ShellProps & {
    notice?: string | null;
    chunkCount: number;
    embeddingCount: number;
    embeddingModel: string;
    vectorDbAvailable: boolean;
    semanticEnabled: boolean;
  },
) {
  return (
    <AppShell {...props} title="Semantic Search Status">
      {props.notice ? (
        <Card>
          <CardSection>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{props.notice}</Badge>
          </CardSection>
        </Card>
      ) : null}
      <Card>
        <CardSection>
          <h3 className="text-lg font-semibold tracking-tight">Semantic Search Status</h3>
        </CardSection>
        <CardSection>
          <div className="grid grid-cols-[200px_1fr] gap-x-3 gap-y-2 text-sm">
            <div className="text-muted-foreground">Semantic search enabled</div>
            <div>{props.semanticEnabled ? "Yes" : "No"}</div>
            <div className="text-muted-foreground">Vector DB (sqlite-vec)</div>
            <div>
              <Badge className={props.vectorDbAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                {props.vectorDbAvailable ? "available" : "unavailable"}
              </Badge>
            </div>
            <div className="text-muted-foreground">Embedding model</div>
            <div className="font-mono text-xs">{props.embeddingModel}</div>
            <div className="text-muted-foreground">Chunks indexed</div>
            <div>{props.chunkCount}</div>
            <div className="text-muted-foreground">Embeddings stored</div>
            <div>{props.embeddingCount}</div>
          </div>
        </CardSection>
        <CardSection>
          <div className="flex flex-wrap gap-2">
            <form action="/actions/reindex-semantic" method="post">
              <Button type="submit">Run Semantic Reindex</Button>
            </form>
            <a href="/search">
              <Button type="button" variant="secondary">Open Search</Button>
            </a>
          </div>
        </CardSection>
      </Card>
    </AppShell>
  );
}
