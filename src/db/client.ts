import { Database } from "bun:sqlite";

import { ensureParentDir } from "../core/utils/fs";
import { migrations } from "./migrations/index";

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

  for (const { filename, sql } of migrations) {
    if (applied.has(filename)) continue;

    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(filename, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return db;
}
