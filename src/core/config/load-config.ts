import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { DEFAULT_CONFIG } from "./defaults";
import type { AppConfig } from "../types/domain";

function expandHomePath(value: string): string {
  if (value === "~") {
    return homedir();
  }

  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }

  return value;
}

function mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...override,
    dbPath: override.dbPath ?? base.dbPath,
    server: {
      ...base.server,
      ...(override.server ?? {}),
    },
    providers: {
      codex: {
        ...base.providers.codex,
        ...(override.providers?.codex ?? {}),
      },
      claudeCode: {
        ...base.providers.claudeCode,
        ...(override.providers?.claudeCode ?? {}),
      },
      cursor: {
        ...base.providers.cursor,
        ...(override.providers?.cursor ?? {}),
      },
    },
    indexing: {
      ...base.indexing,
      ...(override.indexing ?? {}),
    },
    watch: {
      ...base.watch,
      ...(override.watch ?? {}),
    },
    excludes: override.excludes ?? base.excludes,
    semanticSearch: {
      ...base.semanticSearch,
      ...(override.semanticSearch ?? {}),
    },
  };
}

export function getUserConfigPath(): string {
  return join(homedir(), ".config", "agent-index", "config.json");
}

export function getDevConfigPath(cwd: string): string {
  return join(cwd, "agent-index.config.json");
}

export async function loadConfig(cwd: string): Promise<AppConfig> {
  const configPaths = [getUserConfigPath(), getDevConfigPath(cwd)];

  let config = DEFAULT_CONFIG;

  for (const path of configPaths) {
    if (!existsSync(path)) {
      continue;
    }

    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    config = mergeConfig(config, parsed);
  }

  if (process.env.AGENT_INDEX_DB_PATH) {
    config.dbPath = process.env.AGENT_INDEX_DB_PATH;
  }

  if (process.env.AGENT_INDEX_HOST) {
    config.server.host = process.env.AGENT_INDEX_HOST;
  }

  if (process.env.AGENT_INDEX_PORT) {
    config.server.port = Number.parseInt(process.env.AGENT_INDEX_PORT, 10);
  }

  config.dbPath = expandHomePath(config.dbPath);
  config.providers.codex.roots = config.providers.codex.roots.map(expandHomePath);
  config.providers.claudeCode.roots = config.providers.claudeCode.roots.map(expandHomePath);
  config.providers.cursor.roots = config.providers.cursor.roots.map(expandHomePath);

  return config;
}

export async function initDefaultConfig(cwd: string): Promise<string> {
  const userConfigPath = getUserConfigPath();
  const devConfigPath = getDevConfigPath(cwd);
  const path = existsSync(userConfigPath) ? devConfigPath : userConfigPath;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");

  return path;
}

