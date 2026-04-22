import { join } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";

import type {
  AppConfig,
  NormalizedMessage,
  NormalizedThreadBundle,
} from "../../core/types/domain";
import { safeJsonParse, toPreview } from "../../core/utils/text";
import { buildPromptFields, providerEnabled, listJsonlCandidates, basicShouldReparse, readJsonLines, buildSummary, issue } from "../shared";
import type { ProviderAdapter } from "../base";

type CodexThreadMeta = {
  title?: string | null;
  first_user_message?: string | null;
  cwd?: string | null;
  updatedAt?: string | null;
  archived?: number | boolean | null;
  git_branch?: string | null;
  model?: string | null;
  source?: string | null;
  git_origin_url?: string | null;
  agent_nickname?: string | null;
  agent_role?: string | null;
};

function getCodexRoots(config: AppConfig): string[] {
  return config.providers.codex.roots.length > 0 ? config.providers.codex.roots : [join(homedir(), ".codex", "sessions")];
}

function loadCodexThreadMeta(): Map<string, CodexThreadMeta> {
  const statePath = join(homedir(), ".codex", "state_5.sqlite");
  const output = new Map<string, CodexThreadMeta>();

  try {
    const db = new Database(statePath, { readonly: true });
    const rows = db
      .query(
        "SELECT id, title, first_user_message AS first_user_message, cwd, updated_at AS updatedAt, archived, git_branch, model, source FROM threads",
      )
      .all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      output.set(String(row.id), row as unknown as CodexThreadMeta);
    }
    db.close();
  } catch {
    return output;
  }

  return output;
}

function extractTextBlocks(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const parts: string[] = [];

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const typedBlock = block as Record<string, unknown>;
    if (typedBlock.type === "input_text" || typedBlock.type === "output_text") {
      if (typeof typedBlock.text === "string") {
        parts.push(typedBlock.text);
      }
    }
  }

  return parts;
}

export const codexAdapter: ProviderAdapter = {
  id: "codex",
  displayName: "Codex",
  async discover(config) {
    return getCodexRoots(config).map((root) => providerEnabled(config.providers.codex.enabled, root, "codex"));
  },
  async listCandidates(root) {
    return listJsonlCandidates("codex", root);
  },
  async shouldReparse(candidate, existing) {
    return basicShouldReparse(candidate, existing);
  },
  async parse(candidate) {
    const lines = await readJsonLines(candidate.path);
    const metaByThread = loadCodexThreadMeta();
    let threadId = candidate.path.replace(/^.*-([a-f0-9-]{36})\.jsonl$/i, "$1");
    let cwd: string | null = null;
    let title: string | null = null;
    let initialPrompt: string | null = null;
    let updatedAt: string | null = null;
    const messages: NormalizedMessage[] = [];
    const issues = [];
    let ordinal = 0;
    let toolCallCount = 0;

    for (const line of lines) {
      if (!line.value || typeof line.value !== "object") {
        issues.push(issue("codex", candidate.path, "warn", "invalid_json_line", `Invalid JSON at line ${line.line}`));
        continue;
      }

      const record = line.value as Record<string, unknown>;
      const type = record.type;
      const payload = (record.payload as Record<string, unknown> | undefined) ?? {};
      updatedAt = typeof record.timestamp === "string" ? record.timestamp : updatedAt;

      if (type === "session_meta") {
        threadId = typeof payload.id === "string" ? payload.id : threadId;
        cwd = typeof payload.cwd === "string" ? payload.cwd : cwd;
      }

      if (type === "event_msg" && payload.type === "thread_name_updated") {
        title = typeof payload.thread_name === "string" ? payload.thread_name : title;
      }

      if (type === "event_msg" && payload.type === "user_message") {
        const text = typeof payload.message === "string" ? payload.message : null;
        initialPrompt ??= text;
        messages.push({
          ordinal,
          role: "user",
          kind: "chat",
          createdAt: updatedAt,
          contentText: text,
          contentPreview: toPreview(text, 600),
          sourceMessageId: null,
          sourcePath: candidate.path,
          sourceOffset: line.line,
          parseStatus: "ok",
        });
        ordinal += 1;
      }

      if (type === "event_msg" && payload.type === "agent_message") {
        const text = typeof payload.message === "string" ? payload.message : null;
        messages.push({
          ordinal,
          role: "assistant",
          kind: "event",
          createdAt: updatedAt,
          contentText: text,
          contentPreview: toPreview(text, 600),
          sourceMessageId: null,
          sourcePath: candidate.path,
          sourceOffset: line.line,
          parseStatus: "ok",
        });
        ordinal += 1;
      }

      if (type === "response_item" && payload.type === "message") {
        const role = payload.role === "assistant" ? "assistant" : payload.role === "user" ? "user" : "other";
        const text = extractTextBlocks(payload.content).join("\n\n") || null;
        messages.push({
          ordinal,
          role,
          kind: "chat",
          createdAt: updatedAt,
          contentText: text,
          contentPreview: toPreview(text, 600),
          sourceMessageId: null,
          sourcePath: candidate.path,
          sourceOffset: line.line,
          parseStatus: "ok",
        });
        ordinal += 1;
      }

      if (type === "response_item" && payload.type === "function_call") {
        toolCallCount += 1;
        const text = typeof payload.arguments === "string" ? payload.arguments : null;
        messages.push({
          ordinal,
          role: "tool",
          kind: "tool_call",
          createdAt: updatedAt,
          contentText: text,
          contentPreview: toPreview(text, 600),
          toolName: typeof payload.name === "string" ? payload.name : null,
          toolCallId: typeof payload.call_id === "string" ? payload.call_id : null,
          sourceMessageId: null,
          sourcePath: candidate.path,
          sourceOffset: line.line,
          parseStatus: "ok",
        });
        ordinal += 1;
      }

      if (type === "response_item" && payload.type === "function_call_output") {
        const text = typeof payload.output === "string" ? payload.output : null;
        messages.push({
          ordinal,
          role: "tool",
          kind: "tool_result",
          createdAt: updatedAt,
          contentText: text,
          contentPreview: toPreview(text, 600),
          toolCallId: typeof payload.call_id === "string" ? payload.call_id : null,
          sourceMessageId: null,
          sourcePath: candidate.path,
          sourceOffset: line.line,
          parseStatus: "ok",
        });
        ordinal += 1;
      }
    }

    const metadata = metaByThread.get(threadId);
    const sourceMetadata = typeof metadata?.source === "string" ? metadata.source : null;
    const parsedSourceMetadata =
      sourceMetadata && sourceMetadata.trim().startsWith("{") ? safeJsonParse<Record<string, unknown>>(sourceMetadata) : null;
    const summary = buildSummary(messages, 600);
    const promptFields = buildPromptFields(initialPrompt ?? metadata?.first_user_message ?? null, messages, 600);
    const sourceArtifacts = [{ path: candidate.path, role: "primary" }];

    const bundle: NormalizedThreadBundle = {
      providerId: "codex",
      providerThreadId: threadId,
      sourceRootPath: candidate.sourceRootPath,
      sourcePath: candidate.path,
      sourceType: candidate.type,
      title: metadata?.title ?? title ?? promptFields.derivedTitle ?? null,
      titleSource: metadata?.title ? "codex-sqlite:title" : title ? "codex-jsonl:thread_name_updated" : "derived:initial_prompt",
      projectName: cwd ? cwd.split("/").filter(Boolean).at(-1) ?? null : null,
      repoPath: cwd ?? metadata?.cwd ?? null,
      cwd: cwd ?? metadata?.cwd ?? null,
      createdAt: messages[0]?.createdAt ?? updatedAt,
      updatedAt: updatedAt ?? metadata?.updatedAt ?? null,
      isArchived: Boolean(metadata?.archived),
      status: issues.length > 0 ? "partial" : "ok",
      summary: summary.summary,
      initialPrompt: promptFields.initialPrompt,
      initialPromptPreview: promptFields.initialPromptPreview,
      initialPromptSource: metadata?.first_user_message ? "codex-sqlite:first_user_message" : initialPrompt ? "codex-jsonl:user_message" : null,
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
        hasSubagents: Boolean(parsedSourceMetadata?.parent_thread_id),
      },
      metadata: {
        gitBranch: metadata?.git_branch ?? null,
        model: metadata?.model ?? null,
        source: parsedSourceMetadata ?? metadata?.source ?? null,
        parentThreadId: parsedSourceMetadata?.parent_thread_id ?? null,
        agentNickname: parsedSourceMetadata?.agent_nickname ?? null,
        agentRole: parsedSourceMetadata?.agent_role ?? null,
        depth: parsedSourceMetadata?.depth ?? null,
      },
      sourceArtifacts,
      messages,
      issues,
    };

    return [bundle];
  },
};
