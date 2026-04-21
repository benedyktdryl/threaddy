import { Activity, Database, FolderTree, Search, Settings2 } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";

import type { AppConfig } from "../../core/types/domain";
import type { DashboardStats } from "../../db/repos/query-service";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";
import { APP_STYLES } from "./styles";

function NavLink({ href, active, children }: PropsWithChildren<{ href: string; active?: boolean }>) {
  return (
    <a className={cn("nav-link", active && "nav-link-active")} href={href}>
      {children}
    </a>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="stat-card">
      <strong className="stat-value">{value}</strong>
      <div className="stat-label">{label}</div>
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
        <title>{`${title} · Threaddy`}</title>
        <style>{APP_STYLES}</style>
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
                <div className="sidebar-empty">No projects indexed</div>
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
                <div className="sidebar-empty">No saved filters yet</div>
              )}
            </div>

            <div className="nav-group">
              <div className="nav-title">Runtime</div>
              <div className="runtime-card">
                <div className="runtime-title">DB</div>
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
