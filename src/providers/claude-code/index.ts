import { join } from "node:path";
import { homedir } from "node:os";

import type { AppConfig, NormalizedMessage, NormalizedThreadBundle } from "../../core/types/domain";
import { toPreview } from "../../core/utils/text";
import { buildPromptFields, providerEnabled, listJsonlCandidates, basicShouldReparse, readJsonLines, buildSummary, issue } from "../shared";
import type { ProviderAdapter } from "../base";

function getClaudeRoots(config: AppConfig): string[] {
  return config.providers.claudeCode.roots.length > 0
    ? config.providers.claudeCode.roots
    : [join(homedir(), ".claude", "projects")];
}

function flattenClaudeContent(content: unknown): { text: string | null; kind: "chat" | "tool_result" } {
  if (typeof content === "string") {
    return { text: content, kind: "chat" };
  }

  if (!Array.isArray(content)) {
    return { text: null, kind: "chat" };
  }

  const parts: string[] = [];
  let kind: "chat" | "tool_result" = "chat";

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const typedBlock = block as Record<string, unknown>;
    if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
      parts.push(typedBlock.text);
    }
    if (typedBlock.type === "tool_result") {
      kind = "tool_result";
      if (typeof typedBlock.content === "string") {
        parts.push(typedBlock.content);
      }
    }
    if (typedBlock.type === "tool_use") {
      if (typeof typedBlock.name === "string") {
        parts.push(`[tool:${typedBlock.name}]`);
      }
    }
  }

  return { text: parts.join("\n\n") || null, kind };
}

function extractClaudeToolBlocks(content: unknown): Array<{ name: string | null; id: string | null; input: string | null }> {
  if (!Array.isArray(content)) {
    return [];
  }

  const output: Array<{ name: string | null; id: string | null; input: string | null }> = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const typedBlock = block as Record<string, unknown>;
    if (typedBlock.type === "tool_use") {
      output.push({
        name: typeof typedBlock.name === "string" ? typedBlock.name : null,
        id: typeof typedBlock.id === "string" ? typedBlock.id : null,
        input: typedBlock.input ? JSON.stringify(typedBlock.input) : null,
      });
    }
  }

  return output;
}

function extractClaudeUserPrompt(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const typedBlock = block as Record<string, unknown>;
    if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
      parts.push(typedBlock.text);
    }
  }

  return parts.join("\n\n") || null;
}

export const claudeCodeAdapter: ProviderAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  async discover(config) {
    return getClaudeRoots(config).map((root) => providerEnabled(config.providers.claudeCode.enabled, root, "claude-code"));
  },
  async listCandidates(root) {
    return listJsonlCandidates("claude-code", root);
  },
  async shouldReparse(candidate, existing) {
    return basicShouldReparse(candidate, existing);
  },
  async parse(candidate) {
    const lines = await readJsonLines(candidate.path);
    let sessionId = candidate.path.replace(/^.*\/([a-f0-9-]{36})\.jsonl$/i, "$1");
    let cwd: string | null = null;
    let gitBranch: string | null = null;
    let title: string | null = null;
    let aiTitle: string | null = null;
    let initialPrompt: string | null = null;
    let updatedAt: string | null = null;
    const messages: NormalizedMessage[] = [];
    const issues = [];
    const sourceArtifacts = [{ path: candidate.path, role: "primary" }];
    let ordinal = 0;
    let toolCallCount = 0;
    const isSubagent = candidate.path.includes("/subagents/");
    if (isSubagent) {
      sourceArtifacts.push({
        path: candidate.path.replace(/\/subagents\/agent-[^/]+\.jsonl$/, ".jsonl"),
        role: "parent-thread",
      });
    }

    for (const line of lines) {
      if (!line.value || typeof line.value !== "object") {
        issues.push(issue("claude-code", candidate.path, "warn", "invalid_json_line", `Invalid JSON at line ${line.line}`));
        continue;
      }

      const record = line.value as Record<string, unknown>;
      const type = record.type;
      updatedAt = typeof record.timestamp === "string" ? record.timestamp : updatedAt;
      cwd = typeof record.cwd === "string" ? record.cwd : cwd;
      gitBranch = typeof record.gitBranch === "string" ? record.gitBranch : gitBranch;
      sessionId = typeof record.sessionId === "string" ? record.sessionId : sessionId;

      if (type === "custom-title" && typeof record.customTitle === "string" && record.customTitle.trim()) {
        title = record.customTitle;
      }

      if (type === "ai-title" && typeof record.aiTitle === "string" && record.aiTitle.trim()) {
        aiTitle = record.aiTitle;
        title ??= record.aiTitle;
      }

      if (
        type === "user" &&
        record.isSidechain === false &&
        record.parentUuid == null &&
        !initialPrompt
      ) {
        initialPrompt = extractClaudeUserPrompt((record.message as Record<string, unknown> | undefined)?.content);
      }

      if (type !== "user" && type !== "assistant") {
        continue;
      }

      const message = (record.message as Record<string, unknown> | undefined) ?? {};
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "other";
      const content = flattenClaudeContent(message.content);
      const toolBlocks = extractClaudeToolBlocks(message.content);
      toolCallCount += toolBlocks.length;

      messages.push({
        ordinal,
        role,
        kind: content.kind,
        createdAt: updatedAt,
        contentText: content.text,
        contentPreview: toPreview(content.text, 600),
        sourceMessageId: typeof record.uuid === "string" ? record.uuid : null,
        sourcePath: candidate.path,
        sourceOffset: line.line,
        parseStatus: "ok",
      });
      ordinal += 1;

      for (const toolBlock of toolBlocks) {
        messages.push({
          ordinal,
          role: "tool",
          kind: "tool_call",
          createdAt: updatedAt,
          contentText: toolBlock.input,
          contentPreview: toPreview(toolBlock.input, 600),
          toolName: toolBlock.name,
          toolCallId: toolBlock.id,
          sourceMessageId: typeof record.uuid === "string" ? record.uuid : null,
          sourcePath: candidate.path,
          sourceOffset: line.line,
          parseStatus: "ok",
        });
        ordinal += 1;
      }
    }

    const summary = buildSummary(messages, 600);
    const promptFields = buildPromptFields(initialPrompt, messages, 600);
    const resolvedTitle = title ?? aiTitle ?? promptFields.derivedTitle ?? null;
    const titleSource = title ? "claude:custom-title" : aiTitle ? "claude:ai-title" : "derived:initial_prompt";

    const bundle: NormalizedThreadBundle = {
      providerId: "claude-code",
      providerThreadId: sessionId,
      sourceRootPath: candidate.sourceRootPath,
      sourcePath: candidate.path,
      sourceType: candidate.type,
      title: resolvedTitle,
      titleSource,
      projectName: cwd ? cwd.split("/").filter(Boolean).at(-1) ?? null : null,
      repoPath: cwd,
      cwd,
      createdAt: messages[0]?.createdAt ?? updatedAt,
      updatedAt,
      isArchived: false,
      status: issues.length > 0 ? "partial" : "ok",
      summary: summary.summary,
      initialPrompt: promptFields.initialPrompt,
      initialPromptPreview: promptFields.initialPromptPreview,
      initialPromptSource: promptFields.initialPrompt ? "claude:root-user" : null,
      firstUserSnippet: promptFields.firstUserSnippet,
      lastAssistantSnippet: summary.lastAssistantSnippet,
      tags: [],
      capabilities: {
        messages: true,
        messageSearch: true,
        toolCalls: true,
      },
      flags: {
        hasToolCalls: toolCallCount > 0,
        hasOpaqueTranscript: false,
        hasSubagents: isSubagent,
      },
      metadata: {
        gitBranch,
        isSubagent,
      },
      sourceArtifacts,
      messages,
      issues,
    };

    return [bundle];
  },
};
