import { Database } from "@db/sqlite";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const ROOT = Deno.cwd();
const SYSTEM_DIR = join(ROOT, "System");
const DB_PATH = join(SYSTEM_DIR, "journal.db");
const MIGRATIONS_DIR = join(ROOT, "migrations");

async function main() {
  const args = Deno.args;
  const command = args[0];

  if (command !== "up" && command !== "down") {
    console.error("Usage: deno task migrate [up|down]");
    Deno.exit(1);
  }

  await ensureDir(SYSTEM_DIR);
  const db = new Database(DB_PATH);

  try {
    // Ensure migrations table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT (datetime('now'))
      );
    `);

    // Get applied migrations
    const appliedRows = db.prepare("SELECT version FROM schema_migrations ORDER BY id ASC").all();
    const applied = new Set(appliedRows.map((row: any) => row.version));

    // Get available migrations
    const files = [];
    for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
      if (entry.isFile && entry.name.endsWith(".sql")) {
        files.push(entry.name);
      }
    }
    files.sort();

    if (command === "up") {
      for (const file of files) {
        if (!applied.has(file)) {
          console.log(`Applying migration: ${file}`);
          const content = await Deno.readTextFile(join(MIGRATIONS_DIR, file));
          const upSql = extractSql(content, "up");

          db.exec("BEGIN TRANSACTION");
          try {
            db.exec(upSql);
            db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(file);
            db.exec("COMMIT");
            console.log(`✅ Applied ${file}`);
          } catch (err) {
            db.exec("ROLLBACK");
            console.error(`❌ Failed to apply ${file}:`, err);
            Deno.exit(1);
          }
        }
      }
      console.log("All migrations up to date.");
    } else if (command === "down") {
      const lastApplied = Array.from(applied).pop();
      if (!lastApplied) {
        console.log("No migrations to revert.");
        return;
      }

      console.log(`Reverting migration: ${lastApplied}`);
      const content = await Deno.readTextFile(join(MIGRATIONS_DIR, lastApplied));
      const downSql = extractSql(content, "down");

      db.exec("BEGIN TRANSACTION");
      try {
        db.exec(downSql);
        db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(lastApplied);
        db.exec("COMMIT");
        console.log(`✅ Reverted ${lastApplied}`);
      } catch (err) {
        db.exec("ROLLBACK");
        console.error(`❌ Failed to revert ${lastApplied}:`, err);
        Deno.exit(1);
      }
    }
  } finally {
    db.close();
  }
}

function extractSql(content: string, type: "up" | "down"): string {
  const lines = content.split("\n");
  let sql = "";
  let capturing = false;

  for (const line of lines) {
    if (line.trim().startsWith(`-- ${type}`)) {
      capturing = true;
      continue;
    }
    if (line.trim().startsWith("-- ") && (line.includes("up") || line.includes("down"))) {
      if (capturing) break; // Stop if we hit the next section
    }
    if (capturing) {
      sql += line + "\n";
    }
  }
  return sql;
}

if (import.meta.main) {
  main();
}
