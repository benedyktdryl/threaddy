import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export async function ensureParentDir(filePath: string): Promise<void> {
  const parent = filePath.slice(0, filePath.lastIndexOf("/"));
  if (parent) {
    await mkdir(parent, { recursive: true });
  }
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const output: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFilesRecursive(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      output.push(fullPath);
    }
  }

  return output;
}

export async function safeStat(path: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const fileStat = await stat(path);
    return { size: fileStat.size, mtimeMs: fileStat.mtimeMs };
  } catch {
    return null;
  }
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export async function sha256File(path: string): Promise<string> {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

export function fileName(path: string): string {
  return basename(path);
}

