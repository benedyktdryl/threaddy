import { clampMultilineText } from "../core/utils/text";

const HEADLINE_FALLBACK_MAX = 100;
const BODY_PREVIEW_MAX_CHARS = 320;
const BODY_PREVIEW_MAX_LINES = 8;

function pickPromptSource(initialPromptPreview: string | null, firstUserSnippet: string | null): string {
  const fromPreview = (initialPromptPreview ?? "").trim();
  if (fromPreview.length > 0) return fromPreview;
  return (firstUserSnippet ?? "").trim();
}

/** Primary line: real title (bounded), or a short multiline-safe excerpt when untitled. */
export function searchResultHeadline(
  threadTitle: string | null,
  initialPromptPreview: string | null,
  firstUserSnippet: string | null,
): string {
  const title = threadTitle?.trim();
  if (title) {
    return clampMultilineText(title, 220, 5, "…");
  }
  const prompt = pickPromptSource(initialPromptPreview, firstUserSnippet);
  if (!prompt) return "(untitled)";
  return clampMultilineText(prompt, HEADLINE_FALLBACK_MAX, 4, "…");
}

/** Secondary snippet: task / user context only — not matched chunk text (avoids assistant dialogue in the list). */
export function searchResultBodyPreview(
  initialPromptPreview: string | null,
  firstUserSnippet: string | null,
): string {
  const text = pickPromptSource(initialPromptPreview, firstUserSnippet);
  if (!text) return "";
  return clampMultilineText(text, BODY_PREVIEW_MAX_CHARS, BODY_PREVIEW_MAX_LINES, "…");
}
