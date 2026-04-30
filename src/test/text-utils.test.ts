import { describe, expect, test } from "bun:test";

import {
  cleanPromptText,
  clampMultilineText,
  deriveTitleFromPrompt,
  THREAD_PROMPT_MAX_CHARS,
  toPreview,
} from "../core/utils/text";

describe("clampMultilineText", () => {
  test("preserves newlines under limits", () => {
    const input = "a\nb\nc";
    expect(clampMultilineText(input, 100, 10)).toBe("a\nb\nc");
  });

  test("truncates by line count", () => {
    const input = "a\nb\nc\nd";
    expect(clampMultilineText(input, 100, 2)).toBe("a\nb...");
  });

  test("truncates by character count", () => {
    const input = "abcdefghij";
    expect(clampMultilineText(input, 7, 5)).toBe("abcd...");
  });

  test("caps huge blank runs without stripping all newlines", () => {
    const input = `hello\n\n\n\n\n\n\nworld`;
    const out = cleanPromptText(input);
    expect(out).toContain("hello");
    expect(out).toContain("world");
  });
});

describe("cleanPromptText", () => {
  test("keeps single newlines between lines", () => {
    expect(cleanPromptText("line one\nline two")).toBe("line one\nline two");
  });

  test("collapses horizontal space on a line", () => {
    expect(cleanPromptText("too   many   spaces")).toBe("too many spaces");
  });

  test("still extracts codex request section", () => {
    const raw = "## My request for Codex:\n\nDo the thing\n\nThanks";
    expect(cleanPromptText(raw)).toBe("Do the thing\n\nThanks");
  });
});

describe("toPreview", () => {
  test("preserves newlines within char and line caps", () => {
    const s = "L1\nL2\nL3";
    expect(toPreview(s, 80, 5)).toBe("L1\nL2\nL3");
  });

  test("limits lines for previews", () => {
    const s = "a\nb\nc\nd\ne";
    expect(toPreview(s, 100, 3)).toBe("a\nb\nc...");
  });
});

describe("deriveTitleFromPrompt", () => {
  test("uses first non-empty line for title", () => {
    expect(deriveTitleFromPrompt("\n\nHello\nSecond line", 72)).toBe("Hello");
  });
});

describe("storage-sized prompt clamp", () => {
  test("THREAD_PROMPT_MAX_CHARS is a reasonable ceiling", () => {
    expect(THREAD_PROMPT_MAX_CHARS).toBeGreaterThan(4096);
    expect(THREAD_PROMPT_MAX_CHARS).toBeLessThanOrEqual(100_000);
  });
});
