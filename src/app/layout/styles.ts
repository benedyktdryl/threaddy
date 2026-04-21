export const APP_STYLES = `
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
  .nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 14px;
    color: var(--muted);
    transition: background-color 120ms ease, color 120ms ease;
  }
  .nav-link:hover,
  .nav-link-active {
    background: var(--surface-2);
    color: var(--text);
  }
  .sidebar-empty {
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 14px;
    color: var(--muted);
  }
  .runtime-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255,250,241,0.8);
    padding: 12px;
    font-size: 14px;
    color: var(--muted);
  }
  .runtime-title {
    margin-bottom: 4px;
    font-weight: 700;
    color: var(--text);
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
  .stat-card { padding: 16px; }
  .stat-value {
    display: block;
    margin-bottom: 4px;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
  .stat-label { font-size: 14px; color: var(--muted); }
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
  .status-ok { color: #2f6a45; }
  .status-partial { color: #8a5a00; }
  .status-error { color: #992f2f; }
  .notice-badge { color: #2f6a45; }
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
  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .section-title {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .section-title-tight { margin-bottom: 0; }
  .detail-title {
    margin: 12px 0 8px;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.05em;
  }
  .code-block {
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
  }
  @media (max-width: 1100px) {
    .app { grid-template-columns: 1fr; }
    .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
    .cards, .split { grid-template-columns: 1fr; }
    .header { flex-direction: column; }
    .saved-filter-row { grid-template-columns: 1fr; }
    .saved-filter-form { flex-direction: column; align-items: stretch; }
    .pagination-bar { flex-direction: column; align-items: flex-start; }
  }
`;
