#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
// Minimal DB setup script for ExoFrame
// Wrapper around the migration system to initialize the database.

import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const ROOT = Deno.cwd();
const SYSTEM_DIR = join(ROOT, "System");

async function main() {
  console.log("Initializing ExoFrame Database...");

  // Ensure System directory exists
  await ensureDir(SYSTEM_DIR);

  // Run migrations
  const p = new Deno.Command(Deno.execPath(), {
    args: ["task", "migrate", "up"],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await p.output();

  if (code === 0) {
    console.log("✅ Database setup complete.");
  } else {
    console.error("❌ Database setup failed.");
    Deno.exit(code);
  }
}

if (import.meta.main) {
  main();
}
