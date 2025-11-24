import { ConfigService } from "./config/service.ts";
import { FileWatcher } from "./services/watcher.ts";
import { DatabaseService } from "./services/db.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

if (import.meta.main) {
  console.log("🚀 Starting ExoFrame Daemon...");

  try {
    const configService = new ConfigService();
    const config = configService.get();
    const checksum = configService.getChecksum();

    console.log(`✅ Configuration loaded (Checksum: ${checksum.slice(0, 8)})`);
    console.log(`   Root: ${config.system.root}`);
    console.log(`   Log Level: ${config.system.log_level}`);

    // Initialize Database Service
    const dbService = new DatabaseService(config);
    console.log("✅ Database connected (WAL mode)");

    // Ensure Inbox/Requests directory exists
    const inboxPath = join(config.system.root, config.paths.inbox, "Requests");
    await ensureDir(inboxPath);

    // Start file watcher
    const watcher = new FileWatcher(config, (event) => {
      console.log(`📥 New file ready: ${event.path}`);
      console.log(`   Content length: ${event.content.length} bytes`);

      // Log event to Activity Journal
      dbService.logActivity(
        "file_watcher",
        "file.detected",
        event.path,
        { size: event.content.length },
      );

      // TODO: Dispatch to request processor
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log("\n🛑 Shutting down...");
      watcher.stop();
      dbService.close();
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);

    console.log("ExoFrame Daemon Active");

    // Start watching (this will run indefinitely)
    await watcher.start();
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    Deno.exit(1);
  }
}
