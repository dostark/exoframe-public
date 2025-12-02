import { ConfigService } from "./config/service.ts";
import { FileWatcher } from "./services/watcher.ts";
import { DatabaseService } from "./services/db.ts";
import { ProviderFactory } from "./ai/provider_factory.ts";
import { RequestProcessor } from "./services/request_processor.ts";
import { EventLogger } from "./services/event_logger.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

if (import.meta.main) {
  try {
    const configService = new ConfigService();
    const config = configService.get();
    const checksum = configService.getChecksum();

    // Initialize Database Service first (needed for EventLogger)
    const dbService = new DatabaseService(config);

    // Create main EventLogger with database connection
    const logger = new EventLogger({
      db: dbService,
      prefix: "",
      defaultActor: "system",
    });

    logger.log({
      action: "daemon.starting",
      target: "exoframe",
      payload: {
        config_checksum: checksum.slice(0, 8),
        root: config.system.root,
        log_level: config.system.log_level,
      },
      icon: "🚀",
    });

    logger.info("config.loaded", "exo.config.toml", {
      checksum: checksum.slice(0, 8),
      root: config.system.root,
      log_level: config.system.log_level,
    });

    logger.info("database.connected", "journal.db", { mode: "WAL" });

    // Initialize LLM Provider
    const providerInfo = ProviderFactory.getProviderInfo(config);
    const llmProvider = ProviderFactory.create(config);

    logger.info("llm.provider.initialized", providerInfo.id, {
      type: providerInfo.type,
      model: providerInfo.model,
      source: providerInfo.source,
    });

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

    logger.info("request_processor.initialized", "RequestProcessor", {
      inbox: requestsPath,
      blueprints: join(config.system.root, config.paths.blueprints, "Agents"),
    });

    // Create child logger for watcher events
    const watcherLogger = logger.child({ actor: "system" });

    // Start file watcher
    const watcher = new FileWatcher(config, async (event) => {
      watcherLogger.info("file.detected", event.path, {
        size: event.content.length,
      });

      // Process the request and generate a plan
      try {
        const planPath = await requestProcessor.process(event.path);
        if (planPath) {
          watcherLogger.info("plan.generated", planPath, {
            source: event.path,
          });
        } else {
          watcherLogger.warn("request.skipped", event.path, {
            reason: "processing returned null",
          });
        }
      } catch (error) {
        watcherLogger.error("request.failed", event.path, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Handle graceful shutdown
    const shutdown = () => {
      logger.log({
        action: "daemon.stopping",
        target: "exoframe",
        payload: { reason: "signal" },
        icon: "🛑",
      });

      watcher.stop();
      dbService.close();
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);

    logger.log({
      action: "daemon.started",
      target: "exoframe",
      payload: {
        provider: providerInfo.id,
        model: providerInfo.model,
        watching: requestsPath,
        status: "active",
      },
      icon: "✅",
    });

    // Start watching (this will run indefinitely)
    await watcher.start();
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    Deno.exit(1);
  }
}
