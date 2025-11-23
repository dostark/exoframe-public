#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
// Minimal DB setup script for ExoFrame
// Creates System/journal.db with required tables and pragmas.

import { DB } from "sqlite/mod.ts";
import { ensureDir } from "std/fs/mod.ts";
import { join } from "std/path/mod.ts";

const ROOT = Deno.cwd();
const SYSTEM_DIR = join(ROOT, "System");
const DB_PATH = join(SYSTEM_DIR, "journal.db");

async function main() {
  await ensureDir(SYSTEM_DIR);
  const sql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target TEXT,
  payload TEXT NOT NULL,
  timestamp DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_trace ON activity(trace_id);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity(actor);

CREATE TABLE IF NOT EXISTS leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at DATETIME DEFAULT (datetime('now')),
  heartbeat_at DATETIME DEFAULT (datetime('now')),
  expires_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(expires_at);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT (datetime('now'))
);

INSERT INTO schema_version (version)
  SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
`;

  // Try wasm-backed sqlite first; if it fails (older Deno runtime), fall back to sqlite3 CLI.
  try {
    const db = new DB(DB_PATH);
    try {
      db.execute(sql);
      console.log("✅ Database initialized at:", DB_PATH);
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn(
      "sqlite wasm failed, attempting fallback using system sqlite3 binary:",
      String(err),
    );
    await fallbackUsingSqliteCli(DB_PATH, sql);
  }
}

if (import.meta.main) {
  main();
}

async function fallbackUsingSqliteCli(dbPath: string, sql: string) {
  let tmpSqlPath = "";
  try {
    // Prefer testing the actual binary rather than relying on `which`.
    const ver = await new Deno.Command("sqlite3", { args: ["--version"] }).output();
    if (ver.code !== 0) {
      const err = new TextDecoder().decode(ver.stderr || new Uint8Array());
      throw new Error("sqlite3 CLI not found or not runnable: " + err);
    }

    // Write SQL to a temp file and execute via sqlite3 in batch mode using -init
    tmpSqlPath = join(SYSTEM_DIR, `init_schema_${Date.now()}.sql`);
    await Deno.writeTextFile(tmpSqlPath, sql);

    const cmd = new Deno.Command("sqlite3", {
      args: ["-batch", "-init", tmpSqlPath, dbPath],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await cmd.output();

    if (result.code !== 0) {
      const msg = new TextDecoder().decode(result.stderr || new Uint8Array());
      throw new Error(msg || `sqlite3 exited with code ${result.code}`);
    }

    console.log("✅ Database initialized (sqlite3 CLI) at:", dbPath);
  } catch (e) {
    console.error("❌ Fallback failed:", String(e));
    throw e;
  } finally {
    if (tmpSqlPath) {
      await Deno.remove(tmpSqlPath).catch(() => {});
    }
  }
}
