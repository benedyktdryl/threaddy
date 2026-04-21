import type { AppConfig } from "../../core/types/domain";
import type { DashboardStats } from "../../db/repos/query-service";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  return escapeHtml(String(value));
}

function navLink(href: string, label: string, currentPath: string): string {
  const active = currentPath === href || (href !== "/threads" && currentPath.startsWith(href));
  return `<a class="nav-link${active ? " active" : ""}" href="${href}">${text(label)}</a>`;
}

export function renderLayout(input: {
  title: string;
  currentPath: string;
  stats: DashboardStats;
  projects: Array<{ projectName: string; count: number }>;
  providers: Array<{ providerId: string; count: number }>;
  config: AppConfig;
  content: string;
}): string {
  const lastRunText = input.stats.lastRun?.completedAt ?? input.stats.lastRun?.startedAt ?? "Never";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${text(input.title)} · Threaddy</title>
    <style>
      :root {
        --bg: #efe7d9;
        --surface: #fffaf1;
        --surface-2: #f6edde;
        --line: #d8ccb8;
        --text: #1f1c16;
        --muted: #6f6759;
        --accent: #8c4f2d;
        --accent-soft: #f3dfce;
        --ok: #2f6a45;
        --warn: #8a5a00;
        --error: #992f2f;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: linear-gradient(180deg, #f5efe4 0%, var(--bg) 100%); color: var(--text); }
      a { color: inherit; text-decoration: none; }
      .app { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
      .sidebar { background: rgba(255,250,241,0.86); border-right: 1px solid var(--line); padding: 20px 16px; backdrop-filter: blur(12px); }
      .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 18px; }
      .nav-group { margin-bottom: 24px; }
      .nav-title { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px; }
      .nav-link { display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 10px; color: var(--muted); }
      .nav-link.active, .nav-link:hover { background: var(--surface-2); color: var(--text); }
      .chrome { padding: 24px 28px 40px; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
      .header-title { display: flex; flex-direction: column; gap: 4px; }
      .header-title h1 { margin: 0; font-size: 32px; line-height: 1; letter-spacing: -0.04em; }
      .muted { color: var(--muted); }
      .actions { display: flex; align-items: center; gap: 12px; }
      .pill { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 10px 14px; font-size: 13px; }
      .button { display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: white; border-radius: 999px; padding: 10px 16px; font-weight: 700; border: 0; cursor: pointer; }
      .button.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--line); }
      .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
      .card { background: rgba(255,250,241,0.9); border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
      .card strong { font-size: 26px; display: block; margin-bottom: 6px; letter-spacing: -0.04em; }
      .content { background: rgba(255,250,241,0.94); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
      .section { padding: 18px 20px; border-bottom: 1px solid var(--line); }
      .section:last-child { border-bottom: 0; }
      .table-wrap { overflow: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e7ddce; font-size: 14px; vertical-align: top; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); background: rgba(246,237,222,0.65); }
      tr:hover td { background: rgba(246,237,222,0.42); }
      .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; font-size: 12px; font-weight: 700; border: 1px solid var(--line); background: var(--surface-2); }
      .badge.ok { color: var(--ok); }
      .badge.partial { color: var(--warn); }
      .badge.error, .badge.orphaned { color: var(--error); }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .split { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; }
      .stack { display: grid; gap: 12px; }
      .timeline-item { padding: 14px 0; border-bottom: 1px solid #e7ddce; }
      .timeline-item:last-child { border-bottom: 0; }
      .timeline-head { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
      .timeline-body { white-space: pre-wrap; line-height: 1.45; font-size: 14px; }
      .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px 12px; align-items: start; }
      .empty { padding: 28px; color: var(--muted); }
      .path-list { display: grid; gap: 8px; }
      .path-item { background: var(--surface-2); border-radius: 10px; padding: 10px 12px; }
      .top-links { display: flex; gap: 8px; flex-wrap: wrap; }
      @media (max-width: 1100px) {
        .app { grid-template-columns: 1fr; }
        .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
        .cards, .split { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div class="brand">Threaddy</div>
        <div class="nav-group">
          <div class="nav-title">Browse</div>
          ${navLink("/threads", "All Threads", input.currentPath)}
          ${navLink("/diagnostics/issues", "Parse Issues", input.currentPath)}
          ${navLink("/diagnostics/roots", "Source Roots", input.currentPath)}
          ${navLink("/diagnostics/runs", "Index Runs", input.currentPath)}
          ${navLink("/settings", "Settings", input.currentPath)}
        </div>
        <div class="nav-group">
          <div class="nav-title">Providers</div>
          ${input.providers
            .map((provider) => `<div class="nav-link"><span>${text(provider.providerId)}</span><span class="muted">${provider.count}</span></div>`)
            .join("")}
        </div>
        <div class="nav-group">
          <div class="nav-title">Projects</div>
          ${input.projects.length > 0
            ? input.projects
                .map((project) => `<div class="nav-link"><span>${text(project.projectName)}</span><span class="muted">${project.count}</span></div>`)
                .join("")
            : '<div class="nav-link"><span class="muted">No projects indexed</span></div>'}
        </div>
      </aside>
      <main class="chrome">
        <div class="header">
          <div class="header-title">
            <h1>${text(input.title)}</h1>
            <div class="muted">Last indexed: ${text(lastRunText)}</div>
          </div>
          <div class="actions">
            <a class="pill" href="/api/stats">JSON stats</a>
            <a class="pill" href="/api/health">Health</a>
            <a class="button" href="/threads">Threads</a>
          </div>
        </div>
        <div class="cards">
          <div class="card"><strong>${input.stats.threads}</strong><div class="muted">Threads</div></div>
          <div class="card"><strong>${input.stats.messages}</strong><div class="muted">Messages</div></div>
          <div class="card"><strong>${input.stats.issues}</strong><div class="muted">Issues</div></div>
          <div class="card"><strong>${input.stats.runs}</strong><div class="muted">Index Runs</div></div>
        </div>
        ${input.content}
      </main>
    </div>
  </body>
</html>`;
}

