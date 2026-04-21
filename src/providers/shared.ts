import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

import type {
  CandidateSource,
  DiscoveredRoot,
  ExistingSourceRecord,
  NormalizedMessage,
  NormalizedThreadBundle,
  ParseIssueInput,
  ProviderId,
} from "../core/types/domain";
import { stableId } from "../core/utils/ids";
import { listFilesRecursive, pathExists, safeStat } from "../core/utils/fs";
import { firstNonEmpty, toPreview } from "../core/utils/text";

export function providerEnabled(providerEnabled: boolean, root: string, providerId: ProviderId): DiscoveredRoot {
  if (!providerEnabled) {
    return {
      providerId,
      path: root,
      status: "disabled",
      notes: "Provider disabled in config",
    };
  }

  if (!pathExists(root)) {
    return {
      providerId,
      path: root,
      status: "missing",
      notes: "Path not found",
    };
  }

  return {
    providerId,
    path: root,
    status: "ok",
  };
}

export async function listJsonlCandidates(providerId: ProviderId, root: DiscoveredRoot): Promise<CandidateSource[]> {
  if (root.status !== "ok") {
    return [];
  }

  const files = await listFilesRecursive(root.path);
  const candidates: CandidateSource[] = [];

  for (const file of files) {
    if (!file.endsWith(".jsonl")) {
      continue;
    }

    const fileStat = await safeStat(file);
    if (!fileStat) {
      continue;
    }

    candidates.push({
      providerId,
      sourceRootPath: root.path,
      path: file,
      type: "jsonl",
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  return candidates;
}

export function basicShouldReparse(candidate: CandidateSource, existing: ExistingSourceRecord | null): boolean {
  if (!existing) {
    return true;
  }

  return candidate.size !== existing.size || Math.floor(candidate.mtimeMs) !== Math.floor(existing.mtimeMs);
}

export async function readJsonLines(path: string): Promise<Array<{ line: number; raw: string; value: unknown }>> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split("\n");
  const output: Array<{ line: number; raw: string; value: unknown }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }

    try {
      output.push({
        line: index + 1,
        raw: line,
        value: JSON.parse(line) as unknown,
      });
    } catch {
      output.push({
        line: index + 1,
        raw: line,
        value: null,
      });
    }
  }

  return output;
}

export function bundleThreadId(providerId: ProviderId, providerThreadId: string): string {
  return stableId([providerId, providerThreadId]);
}

export function buildSummary(messages: NormalizedMessage[], maxPreviewLength: number): {
  summary: string | null;
  firstUserSnippet: string | null;
  lastAssistantSnippet: string | null;
} {
  const firstUser = messages.find((message) => message.role === "user" && message.contentPreview)?.contentPreview ?? null;
  const lastAssistant =
    [...messages].reverse().find((message) => message.role === "assistant" && message.contentPreview)?.contentPreview ?? null;

  return {
    summary: toPreview(firstNonEmpty([firstUser, lastAssistant]), maxPreviewLength),
    firstUserSnippet: firstUser,
    lastAssistantSnippet: lastAssistant,
  };
}

export function messageId(threadId: string, ordinal: number, sourceMessageId?: string | null): string {
  return stableId([threadId, String(ordinal), sourceMessageId ?? ""]);
}

export function issue(
  providerId: ProviderId,
  sourcePath: string,
  severity: "info" | "warn" | "error",
  code: string,
  message: string,
): ParseIssueInput {
  return { providerId, sourcePath, severity, code, message };
}

export function inferProjectNameFromPath(path: string): string | null {
  const home = homedir();
  const projectsPrefix = join(home, "Projects");

  if (path.startsWith(projectsPrefix)) {
    const rest = path.slice(projectsPrefix.length + 1);
    const firstSegment = rest.split("/")[0];
    return firstSegment || null;
  }

  return basename(dirname(path));
}

export function emptyBundle(input: {
  providerId: ProviderId;
  providerThreadId: string;
  sourceRootPath: string;
  sourcePath: string;
  sourceType: string;
  title?: string | null;
  cwd?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown>;
  capabilities?: Record<string, boolean>;
  flags?: Record<string, boolean>;
  issues?: ParseIssueInput[];
}): NormalizedThreadBundle {
  return {
    providerId: input.providerId,
    providerThreadId: input.providerThreadId,
    sourceRootPath: input.sourceRootPath,
    sourcePath: input.sourcePath,
    sourceType: input.sourceType,
    title: input.title ?? null,
    projectName: inferProjectNameFromPath(input.cwd ?? input.sourcePath),
    repoPath: input.cwd ?? null,
    cwd: input.cwd ?? null,
    createdAt: input.updatedAt ?? null,
    updatedAt: input.updatedAt ?? null,
    isArchived: false,
    status: "partial",
    summary: null,
    firstUserSnippet: null,
    lastAssistantSnippet: null,
    tags: [],
    capabilities: input.capabilities ?? {},
    flags: input.flags ?? {},
    metadata: input.metadata ?? {},
    messages: [],
    issues: input.issues ?? [],
  };
}

