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

    // Ensure required directories exist
    const requestsPath = join(config.system.root, config.paths.inbox, "Requests");
    const plansPath = join(config.system.root, config.paths.inbox, "Plans");
    const activePath = join(config.system.root, "System", "Active");
    await ensureDir(requestsPath);
    await ensureDir(plansPath);
    await ensureDir(activePath);

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

    // Start file watcher for new requests (Inbox/Requests)
    const requestWatcher = new FileWatcher(config, async (event) => {
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

    // Start file watcher for approved plans (System/Active)
    // Detection for Step 5.12: Plan Execution Flow
    const planWatcher = new FileWatcher(
      config,
      async (event) => {
        // Only process plan files (_plan.md suffix)
        if (!event.path.includes("_plan.md")) {
          return;
        }

        watcherLogger.info("plan.detected", event.path, {
          size: event.content.length,
        });

        // Parse plan file to extract trace_id
        try {
          const content = await Deno.readTextFile(event.path);
          const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);

          if (!yamlMatch) {
            watcherLogger.error("plan.invalid_frontmatter", event.path, {
              error: "No YAML frontmatter found",
            });
            return;
          }

          const { parse: parseYaml } = await import("@std/yaml");
          const frontmatter = parseYaml(yamlMatch[1]) as Record<string, unknown>;

          if (!frontmatter.trace_id) {
            watcherLogger.error("plan.missing_trace_id", event.path, {
              error: "trace_id field missing in frontmatter",
            });
            return;
          }

          watcherLogger.info("plan.ready_for_execution", event.path, {
            trace_id: frontmatter.trace_id,
            request_id: frontmatter.request_id || "unknown",
          });

          // TODO: Execute plan (Step 5.12.3 - Code Generation)
          // const changesetId = await planExecutor.execute(event.path);
        } catch (error) {
          watcherLogger.error("plan.detection_failed", event.path, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      undefined, // No separate db instance needed, watcherLogger handles it
      activePath, // Custom watch path
    );

    // Handle graceful shutdown
    const shutdown = () => {
      logger.log({
        action: "daemon.stopping",
        target: "exoframe",
        payload: { reason: "signal" },
        icon: "🛑",
      });

      requestWatcher.stop();
      planWatcher.stop();
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
        watching_requests: requestsPath,
        watching_plans: activePath,
        status: "active",
      },
      icon: "✅",
    });

    // Start watching both directories (this will run indefinitely)
    await Promise.all([requestWatcher.start(), planWatcher.start()]);
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    Deno.exit(1);
  }
}
