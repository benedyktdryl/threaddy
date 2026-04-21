import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";

import type { AppConfig, CandidateSource, DiscoveredRoot, ExistingSourceRecord, NormalizedThreadBundle } from "../../core/types/domain";
import { emptyBundle, issue, providerEnabled } from "../shared";
import { safeJsonParse } from "../../core/utils/text";
import type { ProviderAdapter } from "../base";

type CursorHeader = {
  composerId: string;
  name?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  unifiedMode?: string;
  forceMode?: string;
  subtitle?: string;
  workspaceIdentifier?: {
    id?: string;
    uri?: {
      fsPath?: string;
    };
  };
};

function getCursorRoot(config: AppConfig): string {
  return config.providers.cursor.roots[0] ?? join(homedir(), "Library", "Application Support", "Cursor");
}

function getWorkspacePath(workspaceId: string | undefined): string | null {
  if (!workspaceId || workspaceId === "empty-window") {
    return null;
  }

  const workspaceFile = join(
    homedir(),
    "Library",
    "Application Support",
    "Cursor",
    "User",
    "workspaceStorage",
    workspaceId,
    "workspace.json",
  );

  try {
    return readFile(workspaceFile, "utf8").then((raw) => {
      const parsed = JSON.parse(raw) as { folder?: string };
      return parsed.folder?.replace(/^file:\/\//, "") ?? null;
    }) as unknown as string | null;
  } catch {
    return null;
  }
}

function decodeValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  return null;
}

export const cursorAdapter: ProviderAdapter = {
  id: "cursor",
  displayName: "Cursor",
  async discover(config) {
    const root = getCursorRoot(config);
    return [providerEnabled(config.providers.cursor.enabled, root, "cursor")];
  },
  async listCandidates(root) {
    const path = join(root.path, "User", "globalStorage", "state.vscdb");
    return root.status === "ok"
      ? [
          {
            providerId: "cursor",
            sourceRootPath: root.path,
            path,
            type: "sqlite",
            size: 0,
            mtimeMs: Date.now(),
          },
        ]
      : [];
  },
  async shouldReparse(candidate, existing) {
    if (!existing) {
      return true;
    }

    return true;
  },
  async parse(candidate) {
    const issues = [];
    const output: NormalizedThreadBundle[] = [];

    try {
      const db = new Database(candidate.path, { readonly: true });
      const headerRow = db
        .query("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders' LIMIT 1")
        .get() as Record<string, unknown> | null;

      const headerValue = decodeValue(headerRow?.value);
      const parsedHeaders = safeJsonParse<{ allComposers?: CursorHeader[] }>(headerValue ?? "");
      const headers = parsedHeaders?.allComposers ?? [];

      for (const header of headers) {
        const composerRow = db
          .query("SELECT value FROM cursorDiskKV WHERE key = ? LIMIT 1")
          .get(`composerData:${header.composerId}`) as Record<string, unknown> | null;
        const composerValue = decodeValue(composerRow?.value);
        const composerData = safeJsonParse<Record<string, unknown>>(composerValue ?? "");
        const workspacePath = header.workspaceIdentifier?.uri?.fsPath ?? null;

        output.push(
          emptyBundle({
            providerId: "cursor",
            providerThreadId: header.composerId,
            sourceRootPath: candidate.sourceRootPath,
            sourcePath: candidate.path,
            sourceType: candidate.type,
            title: header.name ?? null,
            cwd: workspacePath,
            updatedAt:
              typeof header.lastUpdatedAt === "number" ? new Date(header.lastUpdatedAt).toISOString() : new Date().toISOString(),
            metadata: {
              subtitle: header.subtitle ?? null,
              unifiedMode: header.unifiedMode ?? null,
              forceMode: header.forceMode ?? null,
              workspaceId: header.workspaceIdentifier?.id ?? null,
              filesChangedCount: composerData?.filesChangedCount ?? null,
            },
            capabilities: {
              messages: false,
              messageSearch: false,
              toolCalls: false,
            },
            flags: {
              hasOpaqueTranscript: true,
            },
            issues: [
              issue(
                "cursor",
                candidate.path,
                "info",
                "partial_transcript_support",
                "Cursor transcript bodies are not fully decoded in v1; metadata indexing only.",
              ),
            ],
          }),
        );
      }

      db.close();
      return output;
    } catch (error) {
      issues.push(
        emptyBundle({
          providerId: "cursor",
          providerThreadId: candidate.path,
          sourceRootPath: candidate.sourceRootPath,
          sourcePath: candidate.path,
          sourceType: candidate.type,
          updatedAt: new Date().toISOString(),
          issues: [
            issue("cursor", candidate.path, "error", "cursor_db_read_failed", error instanceof Error ? error.message : String(error)),
          ],
          flags: {
            hasOpaqueTranscript: true,
          },
          capabilities: {
            messages: false,
            messageSearch: false,
            toolCalls: false,
          },
        }),
      );
      return issues;
    }
  },
};

