import type { Database } from "bun:sqlite";

import type { AppConfig } from "../../core/types/domain";
import {
  getDashboardStats,
  getThreadDetail,
  listIndexRuns,
  listParseIssues,
  listProjects,
  listProviders,
  listSourceRoots,
  listThreads,
} from "../../db/repos/query-service";
import { renderLayout, text } from "../layout/html";

function statusBadge(status: string): string {
  return `<span class="badge ${text(status)}">${text(status)}</span>`;
}

function jsonResponse(payload: unknown): Response {
  return Response.json(payload);
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function notFoundPage(config: AppConfig, db: Database, currentPath: string): Response {
  const html = renderLayout({
    title: "Not Found",
    currentPath,
    stats: getDashboardStats(db),
    projects: listProjects(db),
    providers: listProviders(db),
    config,
    content: `<div class="content"><div class="empty">The requested page was not found.</div></div>`,
  });

  return new Response(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function renderThreadsPage(config: AppConfig, db: Database): string {
  const rows = listThreads(db);
  const content = `
    <div class="content">
      <div class="section">
        <div class="muted">Unified thread index across supported providers. Richest detail is currently available for Codex and Claude Code.</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Provider</th>
              <th>Project</th>
              <th>Updated</th>
              <th>Messages</th>
              <th>Tools</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length > 0
                ? rows
                    .map(
                      (row) => `
              <tr>
                <td><a href="/threads/${text(row.id)}"><strong>${text(row.title ?? "(untitled)")}</strong><div class="muted">${text(row.summary ?? "")}</div></a></td>
                <td>${text(row.providerId)}</td>
                <td>${text(row.projectName ?? "")}<div class="muted mono">${text(row.repoPath ?? "")}</div></td>
                <td>${text(row.updatedAt ?? "")}</td>
                <td>${text(row.messageCount)}</td>
                <td>${text(row.toolCallCount)}</td>
                <td>${statusBadge(row.status)}</td>
              </tr>`,
                    )
                    .join("")
                : '<tr><td colspan="7" class="empty">No indexed threads yet. Run <code>bun run reindex</code>.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>`;

  return renderLayout({
    title: "All Threads",
    currentPath: "/threads",
    stats: getDashboardStats(db),
    projects: listProjects(db),
    providers: listProviders(db),
    config,
    content,
  });
}

function renderThreadDetailPage(config: AppConfig, db: Database, threadId: string): string | null {
  const detail = getThreadDetail(db, threadId);
  if (!detail) {
    return null;
  }

  const capabilities = detail.thread.capabilitiesJson ? JSON.parse(detail.thread.capabilitiesJson) as Record<string, boolean> : {};
  const metadata = detail.thread.metadataJson ? JSON.parse(detail.thread.metadataJson) as Record<string, unknown> : {};
  const flags = detail.thread.flagsJson ? JSON.parse(detail.thread.flagsJson) as Record<string, boolean> : {};
  const partialNotice =
    capabilities.messages === false
      ? `<div class="card"><strong>Partial transcript support</strong><div class="muted">This provider is indexed as metadata-first. Message bodies may be sparse or unavailable.</div></div>`
      : "";

  const content = `
    <div class="split">
      <div class="stack">
        <div class="content">
          <div class="section">
            <div class="top-links">
              ${statusBadge(detail.thread.status)}
              <span class="badge">${text(detail.thread.providerId)}</span>
              ${detail.thread.isArchived ? '<span class="badge">archived</span>' : ""}
            </div>
            <h2>${text(detail.thread.title ?? "(untitled)")}</h2>
            <div class="muted">${text(detail.thread.summary ?? "")}</div>
          </div>
          <div class="section">
            <div class="kv">
              <div class="muted">Project</div><div>${text(detail.thread.projectName ?? "")}</div>
              <div class="muted">Repo / cwd</div><div class="mono">${text(detail.thread.repoPath ?? detail.thread.cwd ?? "")}</div>
              <div class="muted">Created</div><div>${text(detail.thread.createdAt ?? "")}</div>
              <div class="muted">Updated</div><div>${text(detail.thread.updatedAt ?? "")}</div>
              <div class="muted">Provider thread ID</div><div class="mono">${text(detail.thread.providerThreadId)}</div>
            </div>
          </div>
          <div class="section">
            <h3>Timeline</h3>
            ${
              detail.messages.length > 0
                ? detail.messages
                    .map(
                      (message) => `
                <div class="timeline-item">
                  <div class="timeline-head">
                    <span class="badge">${text(message.role)}</span>
                    <span class="badge">${text(message.kind)}</span>
                    ${message.toolName ? `<span class="badge">${text(message.toolName)}</span>` : ""}
                    <span class="muted">${text(message.createdAt ?? "")}</span>
                  </div>
                  <div class="timeline-body">${text(message.contentPreview ?? message.contentText ?? "")}</div>
                </div>`,
                    )
                    .join("")
                : '<div class="empty">No message timeline is available for this thread.</div>'
            }
          </div>
        </div>
      </div>
      <div class="stack">
        ${partialNotice}
        <div class="content">
          <div class="section"><h3>Counts</h3></div>
          <div class="section kv">
            <div class="muted">Messages</div><div>${text(detail.thread.messageCount)}</div>
            <div class="muted">User</div><div>${text(detail.thread.userMessageCount)}</div>
            <div class="muted">Assistant</div><div>${text(detail.thread.assistantMessageCount)}</div>
            <div class="muted">Tool calls</div><div>${text(detail.thread.toolCallCount)}</div>
            <div class="muted">Errors</div><div>${text(detail.thread.errorCount)}</div>
          </div>
        </div>
        <div class="content">
          <div class="section"><h3>Source Artifacts</h3></div>
          <div class="section path-list">
            ${detail.sources.map((source) => `<div class="path-item"><div class="mono">${text(source.sourcePath)}</div><div class="muted">${text(source.sourceRole)}</div></div>`).join("")}
          </div>
        </div>
        <div class="content">
          <div class="section"><h3>Metadata</h3></div>
          <div class="section"><pre class="mono">${text(JSON.stringify({ capabilities, flags, metadata }, null, 2))}</pre></div>
        </div>
        <div class="content">
          <div class="section"><h3>Parse Issues</h3></div>
          <div class="section">
            ${
              detail.issues.length > 0
                ? detail.issues
                    .map(
                      (entry) =>
                        `<div class="timeline-item"><div class="timeline-head"><span class="badge ${text(entry.severity)}">${text(entry.severity)}</span><span class="mono">${text(entry.code)}</span></div><div>${text(entry.message)}</div><div class="muted">count ${text(entry.count)} · ${text(entry.lastSeenAt)}</div></div>`,
                    )
                    .join("")
                : '<div class="muted">No parse issues recorded for this thread.</div>'
            }
          </div>
        </div>
      </div>
    </div>`;

  return renderLayout({
    title: detail.thread.title ?? "Thread Detail",
    currentPath: "/threads",
    stats: getDashboardStats(db),
    projects: listProjects(db),
    providers: listProviders(db),
    config,
    content,
  });
}

function renderDiagnosticsTable(config: AppConfig, db: Database, currentPath: string, title: string, inner: string): string {
  return renderLayout({
    title,
    currentPath,
    stats: getDashboardStats(db),
    projects: listProjects(db),
    providers: listProviders(db),
    config,
    content: `<div class="content">${inner}</div>`,
  });
}

function renderSettingsPage(config: AppConfig, db: Database): string {
  const content = `
    <div class="content">
      <div class="section"><h3>Effective Config</h3></div>
      <div class="section"><pre class="mono">${text(JSON.stringify(config, null, 2))}</pre></div>
    </div>`;

  return renderLayout({
    title: "Settings",
    currentPath: "/settings",
    stats: getDashboardStats(db),
    projects: listProjects(db),
    providers: listProviders(db),
    config,
    content,
  });
}

export function createRouter(db: Database, config: AppConfig): (request: Request) => Response {
  return (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.redirect(`${url.origin}/threads`, 302);
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/stats") {
      return jsonResponse(getDashboardStats(db));
    }

    if (url.pathname === "/threads") {
      return htmlResponse(renderThreadsPage(config, db));
    }

    if (url.pathname.startsWith("/threads/")) {
      const threadId = decodeURIComponent(url.pathname.replace("/threads/", ""));
      const html = renderThreadDetailPage(config, db, threadId);
      return html ? htmlResponse(html) : notFoundPage(config, db, url.pathname);
    }

    if (url.pathname === "/diagnostics/issues") {
      const rows = listParseIssues(db);
      const html = renderDiagnosticsTable(
        config,
        db,
        url.pathname,
        "Parse Issues",
        `
          <div class="section"><h3>Parse Issues</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Provider</th><th>Severity</th><th>Code</th><th>Message</th><th>Count</th><th>Last seen</th></tr></thead>
              <tbody>
                ${
                  rows.length > 0
                    ? rows
                        .map(
                          (row) => `<tr><td>${text(row.providerId)}</td><td>${statusBadge(row.severity)}</td><td class="mono">${text(row.code)}</td><td>${text(row.message)}</td><td>${text(row.count)}</td><td>${text(row.lastSeenAt)}</td></tr>`,
                        )
                        .join("")
                    : '<tr><td colspan="6" class="empty">No parse issues recorded.</td></tr>'
                }
              </tbody>
            </table>
          </div>`,
      );
      return htmlResponse(html);
    }

    if (url.pathname === "/diagnostics/roots") {
      const rows = listSourceRoots(db);
      const html = renderDiagnosticsTable(
        config,
        db,
        url.pathname,
        "Source Roots",
        `
          <div class="section"><h3>Source Roots</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Provider</th><th>Path</th><th>Status</th><th>Last scanned</th><th>Notes</th></tr></thead>
              <tbody>
                ${
                  rows.length > 0
                    ? rows
                        .map(
                          (row) => `<tr><td>${text(row.providerId)}</td><td class="mono">${text(row.path)}</td><td>${statusBadge(row.status)}</td><td>${text(row.lastScannedAt ?? "")}</td><td>${text(row.notes ?? "")}</td></tr>`,
                        )
                        .join("")
                    : '<tr><td colspan="5" class="empty">No roots have been scanned yet.</td></tr>'
                }
              </tbody>
            </table>
          </div>`,
      );
      return htmlResponse(html);
    }

    if (url.pathname === "/diagnostics/runs") {
      const rows = listIndexRuns(db);
      const html = renderDiagnosticsTable(
        config,
        db,
        url.pathname,
        "Index Runs",
        `
          <div class="section"><h3>Index Runs</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Started</th><th>Completed</th><th>Status</th><th>Providers</th><th>Files changed</th><th>Threads</th><th>Messages</th><th>Errors</th></tr></thead>
              <tbody>
                ${
                  rows.length > 0
                    ? rows
                        .map(
                          (row) => `<tr><td>${text(row.startedAt)}</td><td>${text(row.completedAt ?? "")}</td><td>${statusBadge(row.status)}</td><td class="mono">${text(row.providersJson)}</td><td>${text(row.filesChanged)}</td><td>${text(row.threadsUpserted)}</td><td>${text(row.messagesUpserted)}</td><td>${text(row.errors)}</td></tr>`,
                        )
                        .join("")
                    : '<tr><td colspan="8" class="empty">No index runs recorded.</td></tr>'
                }
              </tbody>
            </table>
          </div>`,
      );
      return htmlResponse(html);
    }

    if (url.pathname === "/settings") {
      return htmlResponse(renderSettingsPage(config, db));
    }

    return notFoundPage(config, db, url.pathname);
  };
}

