import type { ReactNode } from "react";

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
} from "../../db/repos/query-service";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardSection } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableWrap, Td, Th, Tr } from "../components/ui/table";
import { AppShell } from "../layout/app-shell";

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";
  return <Badge className={className}>{status}</Badge>;
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      search.set(key, String(value));
    }
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

export function ThreadsPage(
  props: ShellProps & {
    result: ThreadListResult;
    query: ThreadListQuery;
    notice?: string | null;
  },
): ReactNode {
  return (
    <AppShell {...props} title="All Threads">
      <Notice message={props.notice} />
      <SavedFiltersManager currentPath={props.currentPath} savedFilters={props.savedFilters} />
      <ThreadListPanel projects={props.projects} providers={props.providers} query={props.query} result={props.result} />
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
      {query.provider || query.project || query.status || query.q ? (
        <CardSection>
          <form action="/actions/save-filter" className="flex flex-wrap gap-2" method="post">
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
              Save Current Filter
            </Button>
          </form>
        </CardSection>
      ) : null}
      <CardSection>
        <form action={basePath} className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-3 text-sm" method="get">
          <div className="text-muted-foreground">Search</div>
          <div>
            <Input defaultValue={query.q ?? ""} name="q" placeholder="title, initial prompt, project, path" />
          </div>
          <div className="text-muted-foreground">Provider</div>
          <div>
            <Select defaultValue={query.provider ?? ""} name="provider">
              <option value="">All providers</option>
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.providerId}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-muted-foreground">Project</div>
          <div>
            <Select defaultValue={query.project ?? ""} name="project">
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.projectName} value={project.projectName}>
                  {project.projectName}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-muted-foreground">Status</div>
          <div>
            <Select defaultValue={query.status ?? ""} name="status">
              <option value="">All statuses</option>
              {["ok", "partial", "error", "orphaned"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-muted-foreground">Page size</div>
          <div>
            <Select defaultValue={String(query.pageSize)} name="pageSize">
              {[25, 50, 100, 250].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>
          <div />
          <div className="flex gap-2">
            <Button type="submit">Apply Filters</Button>
            <a href={basePath}>
              <Button type="button" variant="secondary">
                Reset
              </Button>
            </a>
          </div>
        </form>
      </CardSection>
      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th>Title</Th>
              <Th>Provider</Th>
              <Th>Project</Th>
              <Th>Updated</Th>
              <Th>Messages</Th>
              <Th>Tools</Th>
              <Th>Status</Th>
            </Tr>
          </thead>
          <tbody>
            {result.items.length > 0 ? (
              result.items.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <a href={`/threads/${row.id}`}>
                      <strong>{row.title ?? "(untitled)"}</strong>
                      <div className="mt-1 text-muted-foreground">{row.initialPromptPreview ?? row.summary ?? ""}</div>
                    </a>
                  </Td>
                  <Td>
                    <a href={`/threads${qs({ ...query, provider: row.providerId, page: 1 })}`}>{row.providerId}</a>
                  </Td>
                  <Td>
                    <a href={`/threads${qs({ ...query, project: row.projectName ?? "", page: 1 })}`}>{row.projectName ?? ""}</a>
                    <div className="font-mono text-xs text-muted-foreground">{row.repoPath ?? ""}</div>
                  </Td>
                  <Td>{row.updatedAt ?? ""}</Td>
                  <Td>{row.messageCount}</Td>
                  <Td>{row.toolCallCount}</Td>
                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td className="empty" colSpan={7}>
                  <div className="py-4 text-muted-foreground">
                  No indexed threads matched this filter set.
                  </div>
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
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

export function ThreadDetailPage(props: ShellProps & { detail: ThreadDetail }): ReactNode {
  const capabilities = props.detail.thread.capabilitiesJson ? (JSON.parse(props.detail.thread.capabilitiesJson) as Record<string, boolean>) : {};
  const metadata = props.detail.thread.metadataJson ? (JSON.parse(props.detail.thread.metadataJson) as Record<string, unknown>) : {};
  const flags = props.detail.thread.flagsJson ? (JSON.parse(props.detail.thread.flagsJson) as Record<string, boolean>) : {};

  return (
    <AppShell {...props} title={props.detail.thread.title ?? "Thread Detail"}>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3">
          <Card>
            <CardSection>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={props.detail.thread.status} />
                <Badge>{props.detail.thread.providerId}</Badge>
                {props.detail.thread.titleSource ? <Badge>{props.detail.thread.titleSource}</Badge> : null}
                {props.detail.thread.isArchived ? <Badge>archived</Badge> : null}
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{props.detail.thread.title ?? "(untitled)"}</h2>
              <div className="text-sm text-muted-foreground">{props.detail.thread.initialPromptPreview ?? props.detail.thread.summary ?? ""}</div>
            </CardSection>
            <CardSection>
              <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
                <div className="text-muted-foreground">Project</div>
                <div>{props.detail.thread.projectName ?? ""}</div>
                <div className="text-muted-foreground">Repo / cwd</div>
                <div className="font-mono text-xs">{props.detail.thread.repoPath ?? props.detail.thread.cwd ?? ""}</div>
                <div className="text-muted-foreground">Created</div>
                <div>{props.detail.thread.createdAt ?? ""}</div>
                <div className="text-muted-foreground">Updated</div>
                <div>{props.detail.thread.updatedAt ?? ""}</div>
                <div className="text-muted-foreground">Provider thread ID</div>
                <div className="font-mono text-xs">{props.detail.thread.providerThreadId}</div>
                <div className="text-muted-foreground">Prompt source</div>
                <div>{props.detail.thread.initialPromptSource ?? "unknown"}</div>
              </div>
            </CardSection>
            <CardSection>
              <h3 className="text-lg font-semibold tracking-tight">Initial Prompt</h3>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-6">
                {props.detail.thread.initialPrompt ?? "No normalized initial prompt is available for this thread."}
              </div>
            </CardSection>
            <CardSection>
              <h3 className="text-lg font-semibold tracking-tight">Timeline</h3>
              {props.detail.messages.length > 0 ? (
                props.detail.messages.map((message, index) => (
                  <div className="border-b border-border py-4 last:border-b-0" key={`${message.ordinal}-${index}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge>{message.role}</Badge>
                      <Badge>{message.kind}</Badge>
                      {message.toolName ? <Badge>{message.toolName}</Badge> : null}
                      <span className="text-sm text-muted-foreground">{message.createdAt ?? ""}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6">{message.contentPreview ?? message.contentText ?? ""}</div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-muted-foreground">No message timeline is available for this thread.</div>
              )}
            </CardSection>
          </Card>
        </div>
        <div className="grid gap-3">
          {capabilities.messages === false ? (
            <Card>
              <CardSection>
                <div className="text-lg font-semibold tracking-tight">
                  Partial transcript support
                </div>
                <div className="mt-2 text-sm text-muted-foreground">This provider is indexed as metadata-first. Message bodies may be sparse or unavailable.</div>
              </CardSection>
            </Card>
          ) : null}
          <Card>
            <CardSection>
              <h3 className="text-lg font-semibold tracking-tight">
                Counts
              </h3>
            </CardSection>
            <CardSection>
              <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
                <div className="text-muted-foreground">Messages</div>
                <div>{props.detail.thread.messageCount}</div>
                <div className="text-muted-foreground">User</div>
                <div>{props.detail.thread.userMessageCount}</div>
                <div className="text-muted-foreground">Assistant</div>
                <div>{props.detail.thread.assistantMessageCount}</div>
                <div className="text-muted-foreground">Tool calls</div>
                <div>{props.detail.thread.toolCallCount}</div>
                <div className="text-muted-foreground">Errors</div>
                <div>{props.detail.thread.errorCount}</div>
              </div>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h3 className="text-lg font-semibold tracking-tight">
                Source Artifacts
              </h3>
            </CardSection>
            <CardSection>
              <div className="grid gap-2">
                {props.detail.sources.map((source) => (
                  <div className="rounded-2xl bg-secondary/60 px-3 py-3" key={`${source.sourceRole}-${source.sourcePath}`}>
                    <div className="font-mono text-xs">{source.sourcePath}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{source.sourceRole}</div>
                  </div>
                ))}
              </div>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h3 className="text-lg font-semibold tracking-tight">
                Metadata
              </h3>
            </CardSection>
            <CardSection>
              <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs leading-5">
                {JSON.stringify({ capabilities, flags, metadata }, null, 2)}
              </pre>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h3 className="text-lg font-semibold tracking-tight">
                Parse Issues
              </h3>
            </CardSection>
            <CardSection>
              {props.detail.issues.length > 0 ? (
                props.detail.issues.map((entry, index) => (
                  <div className="border-b border-border py-4 last:border-b-0" key={`${entry.code}-${index}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.severity} />
                      <span className="font-mono text-xs">{entry.code}</span>
                    </div>
                    <div>{entry.message}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      count {entry.count} · {entry.lastSeenAt}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No parse issues recorded for this thread.</div>
              )}
            </CardSection>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export function ProviderPage(props: ShellProps & { summary: GroupSummaryRow; threads: ThreadListResult }) {
  return (
    <AppShell {...props} title={`Provider · ${props.summary.name}`}>
      <ScopeSummary label="Provider" summary={props.summary} filterHref={`/threads?provider=${encodeURIComponent(props.summary.name)}`} />
      <ThreadListPanel
        basePath={`/providers/${encodeURIComponent(props.summary.name)}`}
        projects={props.projects}
        providers={props.providers}
        query={{ provider: props.summary.name, project: null, status: null, q: null, page: props.threads.page, pageSize: props.threads.pageSize }}
        result={props.threads}
      />
    </AppShell>
  );
}

export function ProjectPage(props: ShellProps & { summary: GroupSummaryRow; threads: ThreadListResult }) {
  return (
    <AppShell {...props} title={`Project · ${props.summary.name}`}>
      <ScopeSummary label="Project" summary={props.summary} filterHref={`/threads?project=${encodeURIComponent(props.summary.name)}`} />
      <ThreadListPanel
        basePath={`/projects/${encodeURIComponent(props.summary.name)}`}
        projects={props.projects}
        providers={props.providers}
        query={{ provider: null, project: props.summary.name, status: null, q: null, page: props.threads.page, pageSize: props.threads.pageSize }}
        result={props.threads}
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

export function SettingsPage(props: ShellProps) {
  return (
    <AppShell {...props} title="Settings">
      <Card>
        <CardSection>
          <h3 className="text-lg font-semibold tracking-tight">Index Actions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action="/actions/reindex" method="post">
              <Button type="submit">Refresh All Providers</Button>
            </form>
            <form action="/actions/reindex/provider/codex" method="post">
              <Button type="submit" variant="secondary">
                Reindex Codex
              </Button>
            </form>
            <form action="/actions/reindex/provider/claude-code" method="post">
              <Button type="submit" variant="secondary">
                Reindex Claude Code
              </Button>
            </form>
            <form action="/actions/reindex/provider/cursor" method="post">
              <Button type="submit" variant="secondary">
                Reindex Cursor
              </Button>
            </form>
          </div>
        </CardSection>
        <CardSection>
          <h3 className="text-lg font-semibold tracking-tight">Effective Config</h3>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5">
            {JSON.stringify(props.config, null, 2)}
          </pre>
        </CardSection>
      </Card>
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
