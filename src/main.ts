import { ConfigService } from "./config/service.ts";
import { FileWatcher } from "./services/watcher.ts";
import { DatabaseService } from "./services/db.ts";
import { ProviderFactory } from "./ai/provider_factory.ts";
import { RequestProcessor } from "./services/request_processor.ts";
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

    // Initialize LLM Provider
    const providerInfo = ProviderFactory.getProviderInfo(config);
    const llmProvider = ProviderFactory.create(config);
    console.log(`✅ LLM Provider initialized: ${providerInfo.id}`);
    console.log(`   Type: ${providerInfo.type}`);
    console.log(`   Model: ${providerInfo.model}`);
    console.log(`   Source: ${providerInfo.source}`);

    // Initialize Database Service
    const dbService = new DatabaseService(config);
    console.log("✅ Database connected (WAL mode)");

    // Log provider initialization to Activity Journal
    dbService.logActivity(
      "system",
      "llm.provider.initialized",
      llmProvider.id,
      {
        type: providerInfo.type,
        model: providerInfo.model,
        source: providerInfo.source,
      },
      undefined,
      null,
    );

    // Ensure Inbox/Requests and Inbox/Plans directories exist
    const requestsPath = join(config.system.root, config.paths.inbox, "Requests");
    const plansPath = join(config.system.root, config.paths.inbox, "Plans");
    await ensureDir(requestsPath);
    await ensureDir(plansPath);

    // Initialize Request Processor
    const requestProcessor = new RequestProcessor(
      config,
      llmProvider,
      dbService,
      {
        inboxPath: join(config.system.root, config.paths.inbox),
        blueprintsPath: join(config.system.root, config.paths.blueprints, "Agents"),
        includeReasoning: true,
      },
    );
    console.log("✅ Request Processor initialized");

    // Start file watcher
    const watcher = new FileWatcher(config, async (event) => {
      console.log(`📥 New file ready: ${event.path}`);
      console.log(`   Content length: ${event.content.length} bytes`);

      // Log event to Activity Journal
      dbService.logActivity(
        "system",
        "file.detected",
        event.path,
        { size: event.content.length },
        undefined,
        null,
      );

      // Process the request and generate a plan
      try {
        const planPath = await requestProcessor.process(event.path);
        if (planPath) {
          console.log(`✅ Plan generated: ${planPath}`);
        } else {
          console.log(`⚠️ Request skipped or failed: ${event.path}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process request: ${event.path}`, error);
      }
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
