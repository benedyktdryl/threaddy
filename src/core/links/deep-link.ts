// Deep links that open a thread directly in its source provider's desktop app.
// Used by both the UI ("Open in app" button) and the MCP tools (`openInApp`
// field on every result), so the URL format lives in one place.
//
// Verified by reverse-engineering each Electron app's main bundle:
//   - Codex.app:  builds `codex://threads/${threadId}` from a "$" helper that
//     calls a global URL open routine (`openThread`/`openThreadInNewWindow`).
//   - Claude.app: the `resume` URL handler runs `importCliSession(<uuid>)`
//     which reads `~/.claude/projects/<slug>/<cliSessionId>.jsonl` and
//     navigates to the cowork session route — so the param is the cliSessionId.
//   - Cursor.app: full deeplink route table enumerated; NO route accepts a
//     composerId, so there is no way to open an existing local Cursor chat
//     externally. Returns null.
//
// In every supported case `providerThreadId` IS the right id (we store
// cliSessionId for claude-code and the codex thread UUID for codex).
export function providerDeepLinkUrl(providerId: string, providerThreadId: string): string | null {
  switch (providerId) {
    case "codex":
      return `codex://threads/${providerThreadId}`;
    case "claude-code":
      return `claude://resume?session=${encodeURIComponent(providerThreadId)}`;
    default:
      return null;
  }
}
