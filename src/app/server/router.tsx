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
import { runIndex } from "../../indexer/pipeline/indexer";
import { IssuesPage, NotFoundPage, RootsPage, RunsPage, SettingsPage, ThreadDetailPage, ThreadsPage } from "../routes/pages";
import { renderDocument } from "./render";

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
  const html = renderDocument(
    <NotFoundPage
      config={config}
      currentPath={currentPath}
      projects={listProjects(db)}
      providers={listProviders(db)}
      stats={getDashboardStats(db)}
    />,
  );

  return new Response(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function buildThreadQuery(url: URL) {
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10);

  return {
    provider: url.searchParams.get("provider"),
    project: url.searchParams.get("project"),
    status: url.searchParams.get("status"),
    q: url.searchParams.get("q"),
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 50,
  };
}

function renderThreadsPage(config: AppConfig, db: Database, url: URL): string {
  const query = buildThreadQuery(url);
  return renderDocument(
    <ThreadsPage
      config={config}
      currentPath="/threads"
      notice={url.searchParams.get("notice")}
      projects={listProjects(db)}
      providers={listProviders(db)}
      query={query}
      result={listThreads(db, query)}
      stats={getDashboardStats(db)}
    />,
  );
}

function renderThreadDetailPage(config: AppConfig, db: Database, threadId: string): string | null {
  const detail = getThreadDetail(db, threadId);
  if (!detail) {
    return null;
  }

  return renderDocument(
    <ThreadDetailPage
      config={config}
      currentPath="/threads"
      detail={detail}
      projects={listProjects(db)}
      providers={listProviders(db)}
      stats={getDashboardStats(db)}
    />,
  );
}

export function createRouter(db: Database, config: AppConfig): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/actions/reindex") {
      await runIndex(db, config);
      return Response.redirect(`${url.origin}/threads?notice=${encodeURIComponent("Index refreshed")}`, 303);
    }

    if (request.method === "POST" && url.pathname.startsWith("/actions/reindex/provider/")) {
      const providerId = url.pathname.replace("/actions/reindex/provider/", "");
      if (providerId === "codex" || providerId === "claude-code" || providerId === "cursor") {
        await runIndex(db, config, providerId);
        return Response.redirect(
          `${url.origin}/threads?provider=${encodeURIComponent(providerId)}&notice=${encodeURIComponent("Provider reindexed")}`,
          303,
        );
      }
    }

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
      return htmlResponse(renderThreadsPage(config, db, url));
    }

    if (url.pathname.startsWith("/threads/")) {
      const threadId = decodeURIComponent(url.pathname.replace("/threads/", ""));
      const html = renderThreadDetailPage(config, db, threadId);
      return html ? htmlResponse(html) : notFoundPage(config, db, url.pathname);
    }

    if (url.pathname === "/diagnostics/issues") {
      return htmlResponse(
        renderDocument(
          <IssuesPage
            config={config}
            currentPath={url.pathname}
            projects={listProjects(db)}
            providers={listProviders(db)}
            rows={listParseIssues(db)}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    if (url.pathname === "/diagnostics/roots") {
      return htmlResponse(
        renderDocument(
          <RootsPage
            config={config}
            currentPath={url.pathname}
            projects={listProjects(db)}
            providers={listProviders(db)}
            rows={listSourceRoots(db)}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    if (url.pathname === "/diagnostics/runs") {
      return htmlResponse(
        renderDocument(
          <RunsPage
            config={config}
            currentPath={url.pathname}
            projects={listProjects(db)}
            providers={listProviders(db)}
            rows={listIndexRuns(db)}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    if (url.pathname === "/settings") {
      return htmlResponse(
        renderDocument(
          <SettingsPage
            config={config}
            currentPath="/settings"
            projects={listProjects(db)}
            providers={listProviders(db)}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    return notFoundPage(config, db, url.pathname);
  };
}
