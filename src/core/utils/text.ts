/** Stored `threads.initial_prompt` — keeps multiline prompts bounded for DB and UI. */
export const THREAD_PROMPT_MAX_CHARS = 24_576;
export const THREAD_PROMPT_MAX_LINES = 200;

/** Message / card previews (`content_preview`, list snippets) — char cap is per call; lines cap shared. */
export const PREVIEW_MAX_LINES = 18;

const DEFAULT_ELLIPSIS = "...";

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Caps vertical runaway (huge blank gaps) while keeping intentional paragraph breaks.
 */
function capBlankRuns(value: string): string {
  return value.replace(/\n{6,}/g, "\n\n\n\n\n");
}

/**
 * Limits multiline text by line count first, then by character length (UTF-16 code units).
 * Appends {@link DEFAULT_ELLIPSIS} when truncated.
 */
export function clampMultilineText(
  value: string,
  maxChars: number,
  maxLines: number,
  ellipsis = DEFAULT_ELLIPSIS,
): string {
  if (!value || maxChars < 1 || maxLines < 1) {
    return "";
  }

  let s = normalizeNewlines(value).trim();
  if (!s) {
    return "";
  }

  s = capBlankRuns(s);

  const lines = s.split("\n");
  let linesTruncated = false;
  let body = lines.length > maxLines ? lines.slice(0, maxLines).join("\n") : s;
  if (lines.length > maxLines) {
    linesTruncated = true;
  }

  const ell = ellipsis.length;
  if (body.length > maxChars) {
    body = `${body.slice(0, Math.max(0, maxChars - ell))}${ellipsis}`;
  } else if (linesTruncated) {
    body = `${body}${ellipsis}`;
  }

  return body;
}

export function toPreview(value: string | null | undefined, maxLength: number, maxLines = PREVIEW_MAX_LINES): string | null {
  if (!value) {
    return null;
  }

  const s = normalizeNewlines(value).trim();
  if (!s) {
    return null;
  }

  const clamped = clampMultilineText(s, maxLength, maxLines);
  return clamped || null;
}

export function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function cleanPromptText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  let normalized = normalizeNewlines(value).trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/^# Files mentioned by the user:\s*/i, "");

  const requestMatch = normalized.match(/## My request for Codex:\s*([\s\S]*)$/i);
  if (requestMatch?.[1]?.trim()) {
    normalized = requestMatch[1].trim();
  }

  normalized = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " "))
    .join("\n");

  normalized = capBlankRuns(normalized).trim();
  return normalized || null;
}

export function deriveTitleFromPrompt(value: string | null | undefined, maxLength = 72): string | null {
  const normalized = cleanPromptText(value);
  if (!normalized) {
    return null;
  }

  const firstLine =
    normalized
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";

  const concise = firstLine
    .replace(/^https?:\/\/\S+\s*/i, "")
    .replace(/^[#*\-\s]+/, "")
    .trim();

  const singleLine = (concise || firstLine).replace(/\s+/g, " ").trim();
  return toPreview(singleLine, maxLength, 1);
}
