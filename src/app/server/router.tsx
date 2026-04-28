import type { Database } from "bun:sqlite";
import { join } from "node:path";

import type { AppConfig } from "../../core/types/domain";
import type { SyncManager } from "../../indexer/watcher";
import {
  getDashboardStats,
  getProjectSummary,
  getProviderSummary,
  getThreadDetail,
  listIndexRuns,
  listParseIssues,
  listProjects,
  listProviders,
  listSavedFilters,
  listSourceRoots,
  listThreads,
} from "../../db/repos/query-service";
import { runIndex, runSemanticOnly } from "../../indexer/pipeline/indexer";
import { hybridSearch } from "../../semantic-search/retrieval/hybrid-search";
import { getRelatedThreads } from "../../semantic-search/retrieval/semantic-search";
import { getSemanticDiagnostics } from "../../semantic-search/storage/chunk-store";
import type { SearchMode } from "../../semantic-search/types/index";
import {
  IssuesPage,
  NotFoundPage,
  ProjectPage,
  ProviderPage,
  RootsPage,
  RunsPage,
  SearchPage,
  SemanticDiagnosticsPage,
  SettingsPage,
  ThreadDetailPage,
  ThreadsPage,
} from "../routes/pages";
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
      savedFilters={listSavedFilters(db)}
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

function withNotice(href: string, notice: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}notice=${encodeURIComponent(notice)}`;
}

async function renderThreadsPage(config: AppConfig, db: Database, url: URL): Promise<string> {
  const query = buildThreadQuery(url);
  const previewId = config.ui.previewPane ? (url.searchParams.get("preview") ?? null) : null;
  const previewDetail = previewId ? getThreadDetail(db, previewId) : null;
  const relatedThreads =
    previewDetail && config.semanticSearch.enabled
      ? await getRelatedThreads(db, previewId!, config.semanticSearch.model, 5)
      : undefined;

  return renderDocument(
    <ThreadsPage
      config={config}
      currentPath="/threads"
      notice={url.searchParams.get("notice")}
      projects={listProjects(db)}
      providers={listProviders(db)}
      savedFilters={listSavedFilters(db)}
      query={query}
      result={listThreads(db, query)}
      stats={getDashboardStats(db)}
      previewPane={config.ui.previewPane}
      previewId={previewId}
      previewDetail={previewDetail}
      relatedThreads={relatedThreads}
    />,
  );
}


export function createRouter(db: Database, config: AppConfig, syncManager?: SyncManager): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/api/sync/events" && syncManager) {
      return new Response(syncManager.subscribe(), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/actions/reindex") {
      await runIndex(db, config);
      return Response.redirect(`${url.origin}/threads?notice=${encodeURIComponent("Index refreshed")}`, 303);
    }

    if (request.method === "POST" && url.pathname === "/actions/reindex-semantic") {
      await runSemanticOnly(db, config);
      return Response.redirect(
        `${url.origin}/diagnostics/semantic?notice=${encodeURIComponent("Semantic index refreshed")}`,
        303,
      );
    }

    if (request.method === "POST" && url.pathname === "/actions/save-filter") {
      const formData = await request.formData();
      const href = String(formData.get("href") ?? "/threads");
      const name = String(formData.get("name") ?? "Saved Filter");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      db.query("INSERT OR IGNORE INTO saved_filters (id, name, href, created_at) VALUES (?, ?, ?, ?)").run(
        id,
        name,
        href,
        new Date().toISOString(),
      );
      return Response.redirect(`${url.origin}${withNotice(href, "Filter saved")}`, 303);
    }

    if (request.method === "POST" && url.pathname.startsWith("/actions/saved-filters/") && url.pathname.endsWith("/rename")) {
      const filterId = decodeURIComponent(url.pathname.slice("/actions/saved-filters/".length, -"/rename".length));
      const formData = await request.formData();
      const redirectTo = String(formData.get("redirectTo") ?? "/threads");
      const name = String(formData.get("name") ?? "").trim();
      if (name.length > 0) {
        db.query("UPDATE saved_filters SET name = ? WHERE id = ?").run(name, filterId);
      }
      return Response.redirect(`${url.origin}${withNotice(redirectTo, "Filter renamed")}`, 303);
    }

    if (request.method === "POST" && url.pathname.startsWith("/actions/saved-filters/") && url.pathname.endsWith("/delete")) {
      const filterId = decodeURIComponent(url.pathname.slice("/actions/saved-filters/".length, -"/delete".length));
      const formData = await request.formData();
      const redirectTo = String(formData.get("redirectTo") ?? "/threads");
      db.query("DELETE FROM saved_filters WHERE id = ?").run(filterId);
      return Response.redirect(`${url.origin}${withNotice(redirectTo, "Filter deleted")}`, 303);
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

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/assets/app.css") {
      return new Response(Bun.file(join(import.meta.dir, "..", "assets", "app.css")), {
        headers: {
          "content-type": "text/css; charset=utf-8",
        },
      });
    }

    if (url.pathname === "/api/stats") {
      return jsonResponse(getDashboardStats(db));
    }

    if (url.pathname === "/api/search") {
      const q = url.searchParams.get("q") ?? "";
      const mode = (url.searchParams.get("mode") ?? config.semanticSearch.mode) as SearchMode;
      const provider = url.searchParams.get("provider");
      const project = url.searchParams.get("project");
      const limit = Math.min(50, Math.max(5, Number.parseInt(url.searchParams.get("limit") ?? "20", 10)));
      if (!q.trim()) return jsonResponse({ results: [] });
      const results = await hybridSearch(db, q, mode, config.semanticSearch.model, limit, provider, project);
      return jsonResponse({ results, mode, q });
    }

    if (url.pathname === "/threads") {
      return htmlResponse(await renderThreadsPage(config, db, url));
    }

    if (url.pathname.startsWith("/providers/")) {
      const providerId = decodeURIComponent(url.pathname.replace("/providers/", ""));
      const summary = getProviderSummary(db, providerId);
      if (!summary) {
        return notFoundPage(config, db, url.pathname);
      }
      const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10);
      return htmlResponse(
        renderDocument(
          <ProviderPage
            config={config}
            currentPath={url.pathname}
            projects={listProjects(db)}
            providers={listProviders(db)}
            savedFilters={listSavedFilters(db)}
            summary={summary}
            threads={listThreads(db, { provider: providerId, project: null, status: null, q: url.searchParams.get("q"), page, pageSize })}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    if (url.pathname.startsWith("/projects/")) {
      const projectName = decodeURIComponent(url.pathname.replace("/projects/", ""));
      const summary = getProjectSummary(db, projectName);
      if (!summary) {
        return notFoundPage(config, db, url.pathname);
      }
      const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10);
      return htmlResponse(
        renderDocument(
          <ProjectPage
            config={config}
            currentPath={url.pathname}
            projects={listProjects(db)}
            providers={listProviders(db)}
            savedFilters={listSavedFilters(db)}
            summary={summary}
            threads={listThreads(db, { provider: null, project: projectName, status: null, q: url.searchParams.get("q"), page, pageSize })}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    if (url.pathname === "/diagnostics/issues") {
      return htmlResponse(
        renderDocument(
          <IssuesPage
            config={config}
            currentPath={url.pathname}
            projects={listProjects(db)}
            providers={listProviders(db)}
            savedFilters={listSavedFilters(db)}
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
            savedFilters={listSavedFilters(db)}
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
            savedFilters={listSavedFilters(db)}
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
            savedFilters={listSavedFilters(db)}
            stats={getDashboardStats(db)}
          />,
        ),
      );
    }

    if (url.pathname === "/search") {
      const q = url.searchParams.get("q") ?? "";
      const mode = (url.searchParams.get("mode") ?? config.semanticSearch.mode) as SearchMode;
      const provider = url.searchParams.get("provider");
      const project = url.searchParams.get("project");
      const limit = 20;
      const results = q.trim()
        ? await hybridSearch(db, q, mode, config.semanticSearch.model, limit, provider, project)
        : [];
      return htmlResponse(
        renderDocument(
          <SearchPage
            config={config}
            currentPath="/search"
            projects={listProjects(db)}
            providers={listProviders(db)}
            savedFilters={listSavedFilters(db)}
            stats={getDashboardStats(db)}
            q={q}
            mode={mode}
            provider={provider}
            project={project}
            results={results}
            semanticEnabled={config.semanticSearch.enabled}
          />,
        ),
      );
    }

    if (url.pathname === "/diagnostics/semantic") {
      const diag = getSemanticDiagnostics(db);
      return htmlResponse(
        renderDocument(
          <SemanticDiagnosticsPage
            config={config}
            currentPath="/diagnostics/semantic"
            projects={listProjects(db)}
            providers={listProviders(db)}
            savedFilters={listSavedFilters(db)}
            stats={getDashboardStats(db)}
            notice={url.searchParams.get("notice")}
            chunkCount={diag.chunkCount}
            embeddingCount={diag.embeddingCount}
            embeddingModel={config.semanticSearch.model}
            vectorDbAvailable={true}
            semanticEnabled={config.semanticSearch.enabled}
          />,
        ),
      );
    }

    if (url.pathname.startsWith("/threads/")) {
      const threadId = decodeURIComponent(url.pathname.replace("/threads/", ""));
      const detail = getThreadDetail(db, threadId);
      if (!detail) return notFoundPage(config, db, url.pathname);
      const related = await getRelatedThreads(db, threadId, config.semanticSearch.model, 5);
      return htmlResponse(
        renderDocument(
          <ThreadDetailPage
            config={config}
            currentPath="/threads"
            detail={detail}
            projects={listProjects(db)}
            providers={listProviders(db)}
            savedFilters={listSavedFilters(db)}
            stats={getDashboardStats(db)}
            relatedThreads={related}
          />,
        ),
      );
    }

    return notFoundPage(config, db, url.pathname);
  };
}
