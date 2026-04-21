import { createHash, randomUUID } from "node:crypto";

export function stableId(parts: string[]): string {
  return createHash("sha1").update(parts.join("\u001f")).digest("hex");
}

export function newId(): string {
  return randomUUID();
}

