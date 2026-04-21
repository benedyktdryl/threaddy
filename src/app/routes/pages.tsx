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
  const className = status === "ok" ? "text-[#2f6a45]" : status === "partial" ? "text-[#8a5a00]" : "text-[#992f2f]";
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
        <Badge className="text-[#2f6a45]">{message}</Badge>
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
        <h3 className="section-title section-title-tight">Saved Filters</h3>
        <div className="muted">Rename or remove shortcuts without leaving the thread view.</div>
      </CardSection>
      <CardSection>
        <div className="stack">
          {savedFilters.map((filter) => (
            <div className="saved-filter-row" key={filter.id}>
              <div className="saved-filter-meta">
                <a href={filter.href}>
                  <strong>{filter.name}</strong>
                </a>
                <div className="mono muted">{filter.href}</div>
              </div>
              <form action={`/actions/saved-filters/${encodeURIComponent(filter.id)}/rename`} className="saved-filter-form" method="post">
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
        <div className="top-links">
          <Badge>{label}</Badge>
          <Badge>{summary.count} threads</Badge>
        </div>
        <h2 className="detail-title">{summary.name}</h2>
        <div className="muted">Latest update: {summary.latestUpdatedAt ?? "unknown"}</div>
      </CardSection>
      <CardSection>
        <div className="kv">
          <div className="muted">Healthy</div>
          <div>{summary.okCount}</div>
          <div className="muted">Partial</div>
          <div>{summary.partialCount}</div>
          <div className="muted">Browse threads</div>
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
        <div className="muted">
          Unified thread index across supported providers. Richest detail is currently available for Codex and Claude Code.
        </div>
      </CardSection>
      {query.provider || query.project || query.status || query.q ? (
        <CardSection>
          <form action="/actions/save-filter" className="top-links" method="post">
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
        <form action={basePath} className="kv" method="get">
          <div className="muted">Search</div>
          <div>
            <Input defaultValue={query.q ?? ""} name="q" placeholder="title, project, path, summary" />
          </div>
          <div className="muted">Provider</div>
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
          <div className="muted">Project</div>
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
          <div className="muted">Status</div>
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
          <div className="muted">Page size</div>
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
          <div className="form-actions">
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
                      <div className="muted">{row.summary ?? ""}</div>
                    </a>
                  </Td>
                  <Td>
                    <a href={`/threads${qs({ ...query, provider: row.providerId, page: 1 })}`}>{row.providerId}</a>
                  </Td>
                  <Td>
                    <a href={`/threads${qs({ ...query, project: row.projectName ?? "", page: 1 })}`}>{row.projectName ?? ""}</a>
                    <div className="mono muted">{row.repoPath ?? ""}</div>
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
                  No indexed threads matched this filter set.
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      <CardSection className="flex items-center justify-between gap-3">
        <div className="muted">
          Showing {result.items.length} of {result.total} threads
        </div>
        <div className="top-links">
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
      <div className="split">
        <div className="stack">
          <Card>
            <CardSection>
              <div className="top-links">
                <StatusBadge status={props.detail.thread.status} />
                <Badge>{props.detail.thread.providerId}</Badge>
                {props.detail.thread.isArchived ? <Badge>archived</Badge> : null}
              </div>
              <h2 className="detail-title">{props.detail.thread.title ?? "(untitled)"}</h2>
              <div className="muted">{props.detail.thread.summary ?? ""}</div>
            </CardSection>
            <CardSection>
              <div className="kv">
                <div className="muted">Project</div>
                <div>{props.detail.thread.projectName ?? ""}</div>
                <div className="muted">Repo / cwd</div>
                <div className="mono">{props.detail.thread.repoPath ?? props.detail.thread.cwd ?? ""}</div>
                <div className="muted">Created</div>
                <div>{props.detail.thread.createdAt ?? ""}</div>
                <div className="muted">Updated</div>
                <div>{props.detail.thread.updatedAt ?? ""}</div>
                <div className="muted">Provider thread ID</div>
                <div className="mono">{props.detail.thread.providerThreadId}</div>
              </div>
            </CardSection>
            <CardSection>
              <h3 className="section-title">Timeline</h3>
              {props.detail.messages.length > 0 ? (
                props.detail.messages.map((message, index) => (
                  <div className="timeline-item" key={`${message.ordinal}-${index}`}>
                    <div className="timeline-head">
                      <Badge>{message.role}</Badge>
                      <Badge>{message.kind}</Badge>
                      {message.toolName ? <Badge>{message.toolName}</Badge> : null}
                      <span className="muted">{message.createdAt ?? ""}</span>
                    </div>
                    <div className="timeline-body">{message.contentPreview ?? message.contentText ?? ""}</div>
                  </div>
                ))
              ) : (
                <div className="empty">No message timeline is available for this thread.</div>
              )}
            </CardSection>
          </Card>
        </div>
        <div className="stack">
          {capabilities.messages === false ? (
            <Card>
              <CardSection>
                <div className="section-title" style={{ marginBottom: 8 }}>
                  Partial transcript support
                </div>
                <div className="muted">This provider is indexed as metadata-first. Message bodies may be sparse or unavailable.</div>
              </CardSection>
            </Card>
          ) : null}
          <Card>
            <CardSection>
              <h3 className="section-title" style={{ marginBottom: 0 }}>
                Counts
              </h3>
            </CardSection>
            <CardSection>
              <div className="kv">
                <div className="muted">Messages</div>
                <div>{props.detail.thread.messageCount}</div>
                <div className="muted">User</div>
                <div>{props.detail.thread.userMessageCount}</div>
                <div className="muted">Assistant</div>
                <div>{props.detail.thread.assistantMessageCount}</div>
                <div className="muted">Tool calls</div>
                <div>{props.detail.thread.toolCallCount}</div>
                <div className="muted">Errors</div>
                <div>{props.detail.thread.errorCount}</div>
              </div>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h3 className="section-title" style={{ marginBottom: 0 }}>
                Source Artifacts
              </h3>
            </CardSection>
            <CardSection>
              <div className="path-list">
                {props.detail.sources.map((source) => (
                  <div className="path-item" key={`${source.sourceRole}-${source.sourcePath}`}>
                    <div className="mono">{source.sourcePath}</div>
                    <div className="muted">{source.sourceRole}</div>
                  </div>
                ))}
              </div>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h3 className="section-title" style={{ marginBottom: 0 }}>
                Metadata
              </h3>
            </CardSection>
            <CardSection>
              <pre className="mono" style={{ margin: 0, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify({ capabilities, flags, metadata }, null, 2)}
              </pre>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h3 className="section-title" style={{ marginBottom: 0 }}>
                Parse Issues
              </h3>
            </CardSection>
            <CardSection>
              {props.detail.issues.length > 0 ? (
                props.detail.issues.map((entry, index) => (
                  <div className="timeline-item" key={`${entry.code}-${index}`}>
                    <div className="timeline-head">
                      <StatusBadge status={entry.severity} />
                      <span className="mono">{entry.code}</span>
                    </div>
                    <div>{entry.message}</div>
                    <div className="muted">
                      count {entry.count} · {entry.lastSeenAt}
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">No parse issues recorded for this thread.</div>
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
        <h3 className="section-title" style={{ marginBottom: 0 }}>
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
                  <Td className="mono">{row.code}</Td>
                  <Td>{row.message}</Td>
                  <Td>{row.count}</Td>
                  <Td>{row.lastSeenAt}</Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td className="empty" colSpan={6}>
                  No parse issues recorded.
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
        <h3 className="section-title" style={{ marginBottom: 0 }}>
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
                  <Td className="mono">{row.path}</Td>
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
                  No roots have been scanned yet.
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
        <h3 className="section-title" style={{ marginBottom: 0 }}>
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
                  <Td className="mono">{row.providersJson}</Td>
                  <Td>{row.filesChanged}</Td>
                  <Td>{row.threadsUpserted}</Td>
                  <Td>{row.messagesUpserted}</Td>
                  <Td>{row.errors}</Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td className="empty" colSpan={8}>
                  No index runs recorded.
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
          <h3 className="section-title">Index Actions</h3>
          <div className="top-links">
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
          <h3 className="section-title">Effective Config</h3>
          <pre className="mono" style={{ margin: 0, overflow: "auto", whiteSpace: "pre-wrap" }}>
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
