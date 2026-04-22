import { Activity, Database, FolderTree, Search, Settings2 } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";

import type { AppConfig } from "../../core/types/domain";
import type { DashboardStats } from "../../db/repos/query-service";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

function NavLink({ href, active, children }: PropsWithChildren<{ href: string; active?: boolean }>) {
  return (
    <a
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
      href={href}
    >
      {children}
    </a>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-[1.75rem] bg-card/90 p-4">
      <strong className="block text-3xl font-semibold tracking-tight">{value}</strong>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
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
        <link href="/assets/app.css" rel="stylesheet" />
      </head>
      <body>
        <div className="min-h-screen p-3 md:p-4">
          <div className="grid min-h-[calc(100vh-1.5rem)] grid-cols-1 overflow-hidden rounded-[2rem] border border-border/80 bg-card/70 shadow-shell backdrop-blur md:grid-cols-[290px_minmax(0,1fr)]">
            <aside className="border-b border-border/80 bg-card/85 px-4 py-5 md:border-b-0 md:border-r">
              <div className="mb-6">
                <div className="flex items-center gap-3 text-[1.75rem] font-semibold tracking-tight">
                  <Database size={22} />
                  <span>Threaddy</span>
                </div>
                <div className="mt-2 text-sm leading-5 text-muted-foreground">
                  Local thread observability across agent tools. Structured metadata first, transcripts when available.
                </div>
              </div>

              <div className="mb-6 space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Browse</div>
                <NavLink href="/threads" active={currentPath === "/threads"}>
                  <span className="inline-flex items-center gap-2">
                    <Search size={15} />
                    All Threads
                  </span>
                </NavLink>
                <NavLink href="/diagnostics/issues" active={currentPath.startsWith("/diagnostics/issues")}>
                  <span className="inline-flex items-center gap-2">
                    <Activity size={15} />
                    Parse Issues
                  </span>
                </NavLink>
                <NavLink href="/diagnostics/roots" active={currentPath.startsWith("/diagnostics/roots")}>
                  <span className="inline-flex items-center gap-2">
                    <FolderTree size={15} />
                    Source Roots
                  </span>
                </NavLink>
                <NavLink href="/diagnostics/runs" active={currentPath.startsWith("/diagnostics/runs")}>
                  <span className="inline-flex items-center gap-2">
                    <Activity size={15} />
                    Index Runs
                  </span>
                </NavLink>
                <NavLink href="/settings" active={currentPath.startsWith("/settings")}>
                  <span className="inline-flex items-center gap-2">
                    <Settings2 size={15} />
                    Settings
                  </span>
                </NavLink>
              </div>

              <div className="mb-6 space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Providers</div>
                {providers.map((provider) => (
                  <NavLink href={`/providers/${encodeURIComponent(provider.providerId)}`} key={provider.providerId}>
                    <span>{provider.providerId}</span>
                    <span className="font-mono text-xs text-muted-foreground">{provider.count}</span>
                  </NavLink>
                ))}
              </div>

              <div className="mb-6 space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Projects</div>
                {projects.length > 0 ? (
                  projects.map((project) => (
                    <NavLink href={`/projects/${encodeURIComponent(project.projectName)}`} key={project.projectName}>
                      <span className="truncate">{project.projectName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{project.count}</span>
                    </NavLink>
                  ))
                ) : (
                  <div className="rounded-2xl px-3 py-2 text-sm text-muted-foreground">No projects indexed</div>
                )}
              </div>

              <div className="mb-6 space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Saved Filters</div>
                {savedFilters.length > 0 ? (
                  savedFilters.map((filter) => (
                    <NavLink href={filter.href} key={filter.id}>
                      <span className="truncate">{filter.name}</span>
                    </NavLink>
                  ))
                ) : (
                  <div className="rounded-2xl px-3 py-2 text-sm text-muted-foreground">No saved filters yet</div>
                )}
              </div>

              <Card className="rounded-[1.5rem] border-dashed bg-background/60 p-4 shadow-none">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Runtime</div>
                <div className="mt-2 font-mono text-xs leading-5 text-foreground">{config.dbPath}</div>
              </Card>
            </aside>

            <main className="px-4 py-5 md:px-6">
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
                  <div className="mt-2 text-sm text-muted-foreground">Last indexed: {lastRunText}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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

              <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard label="Threads" value={stats.threads} />
                <StatCard label="Messages" value={stats.messages} />
                <StatCard label="Issues" value={stats.issues} />
                <StatCard label="Index Runs" value={stats.runs} />
              </div>

              <div className="grid gap-4">{children}</div>
            </main>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const forms = document.querySelectorAll("form[data-auto-submit]");
                for (const form of forms) {
                  let timer = null;
                  const submit = () => form.requestSubmit();
                  for (const element of form.elements) {
                    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) continue;
                    if (element.name === "q") {
                      element.addEventListener("input", () => {
                        window.clearTimeout(timer);
                        timer = window.setTimeout(submit, 220);
                      });
                    } else {
                      element.addEventListener("change", submit);
                    }
                  }
                }
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
