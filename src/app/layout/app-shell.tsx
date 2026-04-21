import { Activity, Database, FolderTree, Search, Settings2 } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";

import type { AppConfig } from "../../core/types/domain";
import type { DashboardStats } from "../../db/repos/query-service";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

function NavLink({ href, active, children }: PropsWithChildren<{ href: string; active?: boolean }>) {
  return (
    <a
      className={cn(
        "flex items-center justify-between rounded-[10px] px-2.5 py-2 text-sm text-[#6f6759] transition-colors hover:bg-[#f6edde] hover:text-[#1f1c16]",
        active && "bg-[#f6edde] text-[#1f1c16]",
      )}
      href={href}
    >
      {children}
    </a>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <strong className="mb-1 block text-[26px] font-extrabold tracking-[-0.04em]">{value}</strong>
      <div className="text-sm text-[#6f6759]">{label}</div>
    </Card>
  );
}

export function AppShell({
  title,
  currentPath,
  stats,
  projects,
  providers,
  savedFilters,
  config,
  children,
  toolbar,
}: PropsWithChildren<{
  title: string;
  currentPath: string;
  stats: DashboardStats;
  projects: Array<{ projectName: string; count: number }>;
  providers: Array<{ providerId: string; count: number }>;
  savedFilters: Array<{ id: string; name: string; href: string }>;
  config: AppConfig;
  toolbar?: ReactNode;
}>) {
  const lastRunText = stats.lastRun?.completedAt ?? stats.lastRun?.startedAt ?? "Never";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} · Threaddy</title>
        <style>{`
          :root {
            --bg: #efe7d9;
            --surface: #fffaf1;
            --surface-2: #f6edde;
            --line: #d8ccb8;
            --text: #1f1c16;
            --muted: #6f6759;
            --accent: #8c4f2d;
          }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body {
            font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
            background:
              radial-gradient(circle at top left, rgba(140,79,45,0.08), transparent 28%),
              linear-gradient(180deg, #f5efe4 0%, var(--bg) 100%);
            color: var(--text);
          }
          a { color: inherit; text-decoration: none; }
          .app { display: grid; grid-template-columns: 288px minmax(0, 1fr); min-height: 100vh; }
          .sidebar {
            border-right: 1px solid var(--line);
            background:
              linear-gradient(180deg, rgba(255,250,241,0.95), rgba(247,241,230,0.86)),
              linear-gradient(135deg, rgba(140,79,45,0.05), transparent);
            padding: 20px 16px;
            backdrop-filter: blur(12px);
          }
          .brand { margin-bottom: 18px; }
          .brand-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.04em;
          }
          .brand-subtitle {
            margin-top: 6px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.4;
          }
          .nav-group { margin-bottom: 24px; }
          .nav-title {
            margin-bottom: 8px;
            color: var(--muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .chrome { padding: 24px 28px 40px; }
          .header {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 34px;
            line-height: 1;
            letter-spacing: -0.05em;
          }
          .header-subtitle { margin-top: 6px; color: var(--muted); font-size: 14px; }
          .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
          .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
          .page-stack { display: grid; gap: 16px; }
          .split { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; }
          .stack { display: grid; gap: 12px; }
          .muted { color: var(--muted); }
          .mono { font-family: "IBM Plex Mono", "SFMono-Regular", monospace; font-size: 12px; }
          .timeline-item { padding: 14px 0; border-bottom: 1px solid #e7ddce; }
          .timeline-item:last-child { border-bottom: 0; }
          .timeline-head { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
          .timeline-body { white-space: pre-wrap; line-height: 1.45; font-size: 14px; }
          .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px 12px; align-items: start; }
          .empty { padding: 28px; color: var(--muted); }
          .path-list { display: grid; gap: 8px; }
          .path-item { background: var(--surface-2); border-radius: 10px; padding: 10px 12px; }
          .top-links { display: flex; gap: 8px; flex-wrap: wrap; }
          .saved-filter-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(260px, 360px) auto;
            gap: 12px;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 1px solid #e7ddce;
          }
          .saved-filter-row:last-child { padding-bottom: 0; border-bottom: 0; }
          .saved-filter-meta { min-width: 0; }
          .saved-filter-form { display: flex; gap: 8px; align-items: center; }
          .icon-label { display: inline-flex; align-items: center; gap: 8px; }
          .ui-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 40px;
            padding: 0 16px;
            border-radius: 999px;
            border: 1px solid transparent;
            font-size: 14px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
            text-decoration: none;
            transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
          }
          .ui-button-md { min-height: 40px; }
          .ui-button-sm { min-height: 36px; padding: 0 12px; font-size: 13px; }
          .ui-button-default { border-color: #8c4f2d; background: #8c4f2d; color: #fff; }
          .ui-button-default:hover { background: #774126; }
          .ui-button-secondary { border-color: #d8ccb8; background: #fffaf1; color: #1f1c16; }
          .ui-button-secondary:hover { background: #f6edde; }
          .ui-button-ghost { border-color: transparent; background: transparent; color: #6f6759; }
          .ui-button-ghost:hover { background: #f6edde; color: #1f1c16; }
          .ui-badge {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid #d8ccb8;
            background: #f6edde;
            padding: 4px 10px;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
          }
          .ui-card { border-radius: 18px; border: 1px solid #d8ccb8; background: rgba(255,250,241,0.94); overflow: hidden; }
          .ui-card-section { border-bottom: 1px solid #d8ccb8; padding: 18px 20px; }
          .ui-card-section:last-child { border-bottom: 0; }
          .ui-input, .ui-select {
            width: 100%;
            min-height: 40px;
            border-radius: 10px;
            border: 1px solid #d8ccb8;
            background: #fffaf1;
            padding: 10px 12px;
            font-size: 14px;
            color: #1f1c16;
          }
          .ui-table-wrap { overflow: auto; }
          .ui-table { width: 100%; border-collapse: collapse; }
          .ui-th {
            background: rgba(246,237,222,0.65);
            padding: 12px 14px;
            text-align: left;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #6f6759;
          }
          .ui-td {
            border-bottom: 1px solid #e7ddce;
            padding: 12px 14px;
            vertical-align: top;
            font-size: 14px;
          }
          .ui-tr:hover .ui-td { background: rgba(246,237,222,0.42); }
          .form-actions { display: flex; gap: 8px; }
          .section-title {
            margin: 0 0 12px;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.03em;
          }
          .detail-title {
            margin: 12px 0 8px;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.05em;
          }
          @media (max-width: 1100px) {
            .app { grid-template-columns: 1fr; }
            .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
            .cards, .split { grid-template-columns: 1fr; }
            .header { flex-direction: column; }
            .saved-filter-row { grid-template-columns: 1fr; }
            .saved-filter-form { flex-direction: column; align-items: stretch; }
          }
        `}</style>
      </head>
      <body>
        <div className="app">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-title">
                <Database size={22} />
                <span>Threaddy</span>
              </div>
              <div className="brand-subtitle">Local thread observability across agent tools. No cloud, no sync, just indexed transcripts and metadata.</div>
            </div>

            <div className="nav-group">
              <div className="nav-title">Browse</div>
              <NavLink href="/threads" active={currentPath === "/threads"}>
                <span className="icon-label">
                  <Search size={15} />
                  All Threads
                </span>
              </NavLink>
              <NavLink href="/diagnostics/issues" active={currentPath.startsWith("/diagnostics/issues")}>
                <span className="icon-label">
                  <Activity size={15} />
                  Parse Issues
                </span>
              </NavLink>
              <NavLink href="/diagnostics/roots" active={currentPath.startsWith("/diagnostics/roots")}>
                <span className="icon-label">
                  <FolderTree size={15} />
                  Source Roots
                </span>
              </NavLink>
              <NavLink href="/diagnostics/runs" active={currentPath.startsWith("/diagnostics/runs")}>
                <span className="icon-label">
                  <Activity size={15} />
                  Index Runs
                </span>
              </NavLink>
              <NavLink href="/settings" active={currentPath.startsWith("/settings")}>
                <span className="icon-label">
                  <Settings2 size={15} />
                  Settings
                </span>
              </NavLink>
            </div>

            <div className="nav-group">
              <div className="nav-title">Providers</div>
              {providers.map((provider) => (
                <NavLink href={`/providers/${encodeURIComponent(provider.providerId)}`} key={provider.providerId}>
                  <span>{provider.providerId}</span>
                  <span>{provider.count}</span>
                </NavLink>
              ))}
            </div>

            <div className="nav-group">
              <div className="nav-title">Projects</div>
              {projects.length > 0 ? (
                projects.map((project) => (
                  <NavLink href={`/projects/${encodeURIComponent(project.projectName)}`} key={project.projectName}>
                    <span>{project.projectName}</span>
                    <span>{project.count}</span>
                  </NavLink>
                ))
              ) : (
                <div className="rounded-[10px] px-2.5 py-2 text-sm text-[#6f6759]">No projects indexed</div>
              )}
            </div>

            <div className="nav-group">
              <div className="nav-title">Saved Filters</div>
              {savedFilters.length > 0 ? (
                savedFilters.map((filter) => (
                  <NavLink href={filter.href} key={filter.id}>
                    <span>{filter.name}</span>
                  </NavLink>
                ))
              ) : (
                <div className="rounded-[10px] px-2.5 py-2 text-sm text-[#6f6759]">No saved filters yet</div>
              )}
            </div>

            <div className="nav-group">
              <div className="nav-title">Runtime</div>
              <div className="rounded-[12px] border border-[#d8ccb8] bg-[rgba(255,250,241,0.8)] p-3 text-sm text-[#6f6759]">
                <div className="mb-1 font-semibold text-[#1f1c16]">DB</div>
                <div className="mono">{config.dbPath}</div>
              </div>
            </div>
          </aside>

          <main className="chrome">
            <div className="header">
              <div>
                <h1>{title}</h1>
                <div className="header-subtitle">Last indexed: {lastRunText}</div>
              </div>
              <div className="header-actions">
                <form action="/actions/reindex" method="post">
                  <Button type="submit">Refresh Index</Button>
                </form>
                <a href="/api/stats">
                  <Button variant="secondary">JSON stats</Button>
                </a>
                <a href="/api/health">
                  <Button variant="secondary">Health</Button>
                </a>
                {toolbar}
              </div>
            </div>

            <div className="cards">
              <StatCard label="Threads" value={stats.threads} />
              <StatCard label="Messages" value={stats.messages} />
              <StatCard label="Issues" value={stats.issues} />
              <StatCard label="Index Runs" value={stats.runs} />
            </div>

            <div className="page-stack">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
