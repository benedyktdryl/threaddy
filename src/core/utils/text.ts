export function toPreview(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}...`;
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

  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/^# Files mentioned by the user:\s*/i, "");

  const requestMatch = normalized.match(/## My request for Codex:\s*([\s\S]*)$/i);
  if (requestMatch?.[1]?.trim()) {
    normalized = requestMatch[1].trim();
  }

  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function deriveTitleFromPrompt(value: string | null | undefined, maxLength = 72): string | null {
  const normalized = cleanPromptText(value);
  if (!normalized) {
    return null;
  }

  const concise = normalized
    .replace(/^https?:\/\/\S+\s*/i, "")
    .replace(/^[#*\-\s]+/, "")
    .trim();

  return toPreview(concise || normalized, maxLength);
}
