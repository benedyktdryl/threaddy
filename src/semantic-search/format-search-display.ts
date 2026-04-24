const HEADLINE_FALLBACK_MAX = 100;
const BODY_PREVIEW_MAX = 320;

function pickPromptSource(initialPromptPreview: string | null, firstUserSnippet: string | null): string {
  const fromPreview = (initialPromptPreview ?? "").trim();
  if (fromPreview.length > 0) return fromPreview;
  return (firstUserSnippet ?? "").trim();
}

/** Primary line: real title, or a short start of the user/task prompt when untitled. */
export function searchResultHeadline(
  threadTitle: string | null,
  initialPromptPreview: string | null,
  firstUserSnippet: string | null,
): string {
  const title = threadTitle?.trim();
  if (title) return title;
  const prompt = pickPromptSource(initialPromptPreview, firstUserSnippet);
  if (!prompt) return "(untitled)";
  if (prompt.length <= HEADLINE_FALLBACK_MAX) return prompt;
  return `${prompt.slice(0, HEADLINE_FALLBACK_MAX)}…`;
}

/** Secondary snippet: task / user context only — not matched chunk text (avoids assistant dialogue in the list). */
export function searchResultBodyPreview(
  initialPromptPreview: string | null,
  firstUserSnippet: string | null,
): string {
  const text = pickPromptSource(initialPromptPreview, firstUserSnippet);
  if (!text) return "";
  if (text.length <= BODY_PREVIEW_MAX) return text;
  return `${text.slice(0, BODY_PREVIEW_MAX)}…`;
}
