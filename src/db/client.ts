import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureParentDir } from "../core/utils/fs";

export async function openDatabase(dbPath: string): Promise<Database> {
  await ensureParentDir(dbPath);
  const db = new Database(dbPath, { create: true });

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");

  const applied = new Set(
    db
      .query("SELECT version FROM schema_migrations")
      .all()
      .map((row) => String((row as Record<string, unknown>).version)),
  );

  const migrationsDir = join(import.meta.dir, "migrations");
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return db;
}
