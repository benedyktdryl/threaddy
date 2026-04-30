import {
  Activity,
  Bookmark,
  ChevronRight,
  Circle,
  Database,
  FolderOpen,
  FolderTree,
  Search,
  Settings2,
  Zap,
} from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";

import type { AppConfig } from "../../core/types/domain";
import type { DashboardStats } from "../../db/repos/query-service";
import { cn } from "../lib/utils";

function NavItem({
  href,
  active,
  icon,
  count,
  children,
}: PropsWithChildren<{ href: string; active?: boolean; icon?: ReactNode; count?: number }>) {
  return (
    <a
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover))]",
        active && "bg-[hsl(var(--sidebar-active))] font-medium",
      )}
      href={href}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-none", active ? "bg-blue-100 text-blue-700" : "bg-[hsl(var(--sidebar-hover))] text-[hsl(var(--sidebar-muted))]")}>
          {count}
        </span>
      )}
    </a>
  );
}

function NavSection({
  label,
  children,
  defaultOpen = true,
}: PropsWithChildren<{ label: string; defaultOpen?: boolean }>) {
  return (
    <details className="group mt-3" open={defaultOpen}>
      <summary className="mb-0.5 flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-fg))] [&::-webkit-details-marker]:hidden">
        <ChevronRight className="shrink-0 transition-transform duration-150 group-open:rotate-90" size={10} />
        {label}
      </summary>
      <div className="space-y-px">{children}</div>
    </details>
  );
}

function StatusPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-[11px] text-[hsl(var(--sidebar-muted))]", className)}>
      {children}
    </span>
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
  fullBleed,
  backHref,
}: PropsWithChildren<{
  title: string;
  currentPath: string;
  stats: DashboardStats;
  projects: Array<{ projectName: string; count: number }>;
  providers: Array<{ providerId: string; count: number }>;
  savedFilters: Array<{ id: string; name: string; href: string }>;
  config: AppConfig;
  toolbar?: ReactNode;
  fullBleed?: boolean;
  backHref?: string;
}>) {
  const lastRunText = stats.lastRun?.completedAt ?? stats.lastRun?.startedAt ?? "Never";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · Threaddy`}</title>
        <link href="/assets/app.css" rel="stylesheet" />
        <link
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%233b82f6'/%3E%3Cg stroke='white' stroke-linecap='round' stroke-width='2.2' fill='none'%3E%3Cline x1='8' y1='10' x2='24' y2='10'/%3E%3Cline x1='8' y1='16' x2='20' y2='16'/%3E%3Cpath d='M8 22 Q14 19 20 22 Q24 24 24 22' stroke-linejoin='round'/%3E%3C/g%3E%3C/svg%3E"
          rel="icon"
          type="image/svg+xml"
        />
      </head>
      <body>
        <div className="flex h-screen flex-col">
          {/* Main content area */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside
              className="flex w-[220px] shrink-0 flex-col overflow-hidden bg-[hsl(var(--sidebar-bg))]"
              style={{ borderRight: "1px solid hsl(var(--sidebar-border))" }}
            >
              {/* Logo */}
              <div
                className="flex shrink-0 items-center gap-2 px-3 py-3"
                style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
              >
                <div className="flex h-[22px] w-[22px] items-center justify-center rounded bg-blue-500">
                  <Database className="text-white" size={12} />
                </div>
                <span className="text-[13px] font-semibold text-[hsl(var(--sidebar-fg))]">Threaddy</span>
              </div>

              {/* Nav — scrollable */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
                {/* Top-level */}
                <div className="space-y-px">
                  <NavItem
                    active={currentPath === "/threads"}
                    count={stats.threads}
                    href="/threads"
                    icon={<Search className="text-blue-500" size={14} />}
                  >
                    All Threads
                  </NavItem>
                  <NavItem
                    active={currentPath === "/search"}
                    href="/search"
                    icon={<Zap className="text-violet-500" size={14} />}
                  >
                    Semantic Search
                  </NavItem>
                </div>

                {providers.length > 0 && (
                  <NavSection label="Providers">
                    {providers.map((p) => (
                      <NavItem
                        count={p.count}
                        href={`/providers/${encodeURIComponent(p.providerId)}`}
                        icon={<Circle className="fill-amber-400 text-amber-400" size={8} />}
                        key={p.providerId}
                      >
                        {p.providerId}
                      </NavItem>
                    ))}
                  </NavSection>
                )}

                {projects.length > 0 && (
                  <NavSection label="Projects">
                    {projects.map((p) => (
                      <NavItem
                        count={p.count}
                        href={`/projects/${encodeURIComponent(p.projectName)}`}
                        icon={<FolderOpen className="text-emerald-500" size={14} />}
                        key={p.projectName}
                      >
                        {p.projectName}
                      </NavItem>
                    ))}
                  </NavSection>
                )}

                {savedFilters.length > 0 && (
                  <NavSection label="Saved Filters">
                    {savedFilters.map((f) => (
                      <NavItem
                        href={f.href}
                        icon={<Bookmark className="text-indigo-500" size={13} />}
                        key={f.id}
                      >
                        {f.name}
                      </NavItem>
                    ))}
                  </NavSection>
                )}

                <NavSection defaultOpen={false} label="Diagnostics">
                  <NavItem
                    active={currentPath.startsWith("/diagnostics/issues")}
                    href="/diagnostics/issues"
                    icon={<Activity className="text-rose-500" size={13} />}
                  >
                    Parse Issues
                  </NavItem>
                  <NavItem
                    active={currentPath.startsWith("/diagnostics/roots")}
                    href="/diagnostics/roots"
                    icon={<FolderTree className="text-rose-400" size={13} />}
                  >
                    Source Roots
                  </NavItem>
                  <NavItem
                    active={currentPath.startsWith("/diagnostics/runs")}
                    href="/diagnostics/runs"
                    icon={<Activity className="text-rose-400" size={13} />}
                  >
                    Index Runs
                  </NavItem>
                  <NavItem
                    active={currentPath.startsWith("/diagnostics/semantic")}
                    href="/diagnostics/semantic"
                    icon={<Database className="text-rose-400" size={13} />}
                  >
                    Semantic Status
                  </NavItem>
                </NavSection>
              </div>

              {/* Settings pinned at bottom */}
              <div
                className="shrink-0 px-2 pb-2 pt-1"
                style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
              >
                <NavItem
                  active={currentPath.startsWith("/settings")}
                  href="/settings"
                  icon={<Settings2 className="text-slate-400" size={14} />}
                >
                  Settings
                </NavItem>
              </div>
            </aside>

            {/* Main */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Top bar */}
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-2.5">
                <div className="flex items-center gap-2">
                  {backHref && (
                    <a
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      data-back
                      href={backHref}
                    >
                      <svg fill="none" height="12" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Back
                    </a>
                  )}
                  {backHref && <span className="text-[12px] text-border">/</span>}
                  <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground" id="sync-badge">
                    <span className="inline-block h-2 w-2 rounded-full" id="sync-dot" />
                    <span id="sync-text">Syncing…</span>
                  </span>
                  <form action="/actions/reindex" method="post">
                    <button
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
                      type="submit"
                    >
                      Refresh Index
                    </button>
                  </form>
                  {toolbar}
                </div>
              </div>

              {/* Page content */}
              {fullBleed ? (
                <main className="flex min-h-0 flex-1 overflow-hidden">{children}</main>
              ) : (
                <main className="flex-1 overflow-y-auto p-5">
                  <div className="grid gap-4">{children}</div>
                </main>
              )}
            </div>
          </div>

          {/* Status bar */}
          <footer
            className="flex shrink-0 items-center gap-4 overflow-hidden px-4 py-1.5"
            style={{
              borderTop: "1px solid hsl(var(--statusbar-border))",
              background: "hsl(var(--statusbar-bg))",
            }}
          >
            <StatusPill>
              <Database size={10} />
              <span className="max-w-[240px] truncate font-mono">{config.dbPath}</span>
            </StatusPill>
            <StatusPill>
              <span className="text-[hsl(var(--sidebar-border))]">·</span>
              Last indexed: {lastRunText}
            </StatusPill>
            <StatusPill>
              <span className="text-[hsl(var(--sidebar-border))]">·</span>
              {stats.threads} threads
            </StatusPill>
            {providers.map((p) => (
              <StatusPill key={p.providerId}>
                <span className="text-[hsl(var(--sidebar-border))]">·</span>
                {p.providerId}: {p.count}
              </StatusPill>
            ))}
          </footer>
        </div>

        {/* Command+K search palette */}
        <div className="fixed inset-0 z-50 hidden" id="cmdk">
          <div className="absolute inset-0 bg-black/50" id="cmdk-bd" />
          <div className="relative mx-auto mt-[16vh] max-w-[560px] px-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <Search className="shrink-0 text-muted-foreground" size={15} />
                <input
                  autoComplete="off"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  id="cmdk-input"
                  placeholder="Search conversations…"
                  spellCheck="false"
                  type="text"
                />
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
              </div>
              <div className="max-h-[380px] overflow-y-auto" id="cmdk-results" />
              <div className="flex items-center justify-between border-t border-border px-4 py-2">
                <span className="text-[11px] text-muted-foreground">Hybrid search</span>
                <span className="text-[11px] text-muted-foreground">↑↓ navigate · ↵ open · ⇧↵ full results</span>
              </div>
            </div>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const badge = document.getElementById("sync-badge");
                const dot = document.getElementById("sync-dot");
                const text = document.getElementById("sync-text");
                let hideTimer = null;

                function show(state, label) {
                  clearTimeout(hideTimer);
                  badge.classList.remove("hidden");
                  badge.classList.add("flex");
                  dot.className = "inline-block h-2 w-2 rounded-full " + (
                    state === "syncing" ? "bg-blue-500 animate-pulse" :
                    state === "done"    ? "bg-emerald-500" :
                                         "bg-rose-500"
                  );
                  text.textContent = label;
                  if (state !== "syncing") {
                    hideTimer = setTimeout(() => {
                      badge.classList.add("hidden");
                      badge.classList.remove("flex");
                    }, state === "error" ? 6000 : 3000);
                  }
                }

                function hide() {
                  clearTimeout(hideTimer);
                  badge.classList.add("hidden");
                  badge.classList.remove("flex");
                }

                const es = new EventSource("/api/sync/events");
                es.onmessage = (e) => {
                  try {
                    const d = JSON.parse(e.data);
                    if (d.type === "start") show("syncing", "Syncing…");
                    else if (d.type === "done") show("done", d.newThreads > 0 ? d.newThreads + " new" : "Up to date");
                    else if (d.type === "error") show("error", "Sync error");
                    else hide();
                  } catch {}
                };
                es.onerror = () => hide();
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                // Back links — use history.back() when available so ?preview= state is preserved
                for (const el of document.querySelectorAll("[data-back]")) {
                  el.addEventListener("click", (e) => {
                    if (history.length > 1) {
                      e.preventDefault();
                      history.back();
                    }
                  });
                }

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

                const modal = document.getElementById("cmdk");
                const backdrop = document.getElementById("cmdk-bd");
                const input = document.getElementById("cmdk-input");
                const results = document.getElementById("cmdk-results");
                let selected = -1;
                let items = [];
                let fetchTimer = null;

                function esc(s) {
                  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
                }

                function open() {
                  modal.classList.remove("hidden");
                  input.value = "";
                  input.focus();
                  selected = -1;
                  items = [];
                  results.innerHTML = "";
                }

                function close() { modal.classList.add("hidden"); }

                function highlight(idx) {
                  const els = results.querySelectorAll("[data-cmdk-item]");
                  els.forEach((el, i) => el.classList.toggle("bg-accent", i === idx));
                  if (idx >= 0 && els[idx]) els[idx].scrollIntoView({ block: "nearest" });
                }

                function setSelected(idx) {
                  selected = Math.max(-1, Math.min(idx, items.length - 1));
                  highlight(selected);
                }

                function renderItems(data) {
                  items = data;
                  selected = -1;
                  if (!data.length) {
                    results.innerHTML = '<div class="px-4 py-6 text-center text-sm text-muted-foreground">No results</div>';
                    return;
                  }
                  results.innerHTML = data.map((r, i) => {
                    const title = esc(r.threadTitle || r.initialPromptPreview || r.firstUserSnippet || "(untitled)");
                    const meta = [esc(r.provider), r.projectName ? esc(r.projectName) : null].filter(Boolean).join(" · ");
                    return \`<a href="/threads/\${esc(r.threadId)}" data-cmdk-item="\${i}"
                      class="flex flex-col border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-accent cursor-pointer">
                      <span class="truncate text-[13px] font-medium text-foreground">\${title}</span>
                      <span class="mt-0.5 text-[11px] text-muted-foreground">\${meta}</span>
                    </a>\`;
                  }).join("");
                }

                async function doSearch(q) {
                  if (!q.trim()) { results.innerHTML = ""; items = []; return; }
                  try {
                    const res = await fetch("/api/search?q=" + encodeURIComponent(q) + "&mode=hybrid&limit=8");
                    const data = await res.json();
                    renderItems(data.results || []);
                  } catch {}
                }

                input.addEventListener("input", () => {
                  clearTimeout(fetchTimer);
                  fetchTimer = setTimeout(() => doSearch(input.value), 180);
                });

                input.addEventListener("keydown", (e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSelected(selected + 1); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(selected - 1); }
                  else if (e.key === "Enter") {
                    if (e.shiftKey || selected < 0) {
                      const q = input.value.trim();
                      if (q) window.location.href = "/search?q=" + encodeURIComponent(q) + "&mode=hybrid";
                    } else if (items[selected]) {
                      window.location.href = "/threads/" + items[selected].threadId;
                    }
                  }
                });

                document.addEventListener("keydown", (e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                    e.preventDefault();
                    modal.classList.contains("hidden") ? open() : close();
                  } else if (e.key === "Escape" && !modal.classList.contains("hidden")) {
                    e.preventDefault();
                    close();
                  }
                });

                backdrop.addEventListener("click", close);

                // Message expand/collapse
                document.addEventListener("click", function(e) {
                  const btn = e.target.closest(".msg-expand-btn");
                  if (!btn) return;
                  const wrapper = btn.previousElementSibling;
                  if (!wrapper || !wrapper.classList.contains("msg-collapsible")) return;
                  const isCollapsed = wrapper.classList.contains("max-h-28") || wrapper.classList.contains("max-h-20");
                  if (isCollapsed) {
                    wrapper.classList.remove("max-h-28", "max-h-20", "overflow-hidden");
                    const fade = wrapper.querySelector(".bg-gradient-to-t");
                    if (fade) fade.style.display = "none";
                    btn.textContent = "show less";
                  } else {
                    const cls = btn.dataset.collapseClass || "max-h-28";
                    wrapper.classList.add(cls, "overflow-hidden");
                    const fade = wrapper.querySelector(".bg-gradient-to-t");
                    if (fade) fade.style.display = "";
                    btn.textContent = "show more";
                  }
                });

                // Message timeline filter
                document.addEventListener("click", function(e) {
                  const btn = e.target.closest(".msg-filter-btn");
                  if (!btn) return;
                  const bar = btn.closest("#msg-filter-bar");
                  const list = document.getElementById("msg-list");
                  if (!bar || !list) return;
                  const filter = btn.dataset.filter;
                  // Update button styles
                  for (const b of bar.querySelectorAll(".msg-filter-btn")) {
                    b.classList.toggle("bg-[hsl(var(--muted))]", b === btn);
                    b.classList.toggle("font-medium", b === btn);
                    b.classList.toggle("text-[hsl(var(--muted-foreground))]", b !== btn);
                  }
                  // Show/hide rows
                  for (const row of list.children) {
                    const kind = row.dataset.msgKind;
                    const role = row.dataset.msgRole;
                    if (filter === "all") {
                      row.style.display = "";
                    } else if (filter === "chat") {
                      row.style.display = (role === "user" || role === "assistant") ? "" : "none";
                    } else if (filter === "tools") {
                      row.style.display = (kind === "tool_call" || kind === "tool_result") ? "" : "none";
                    }
                  }
                });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
