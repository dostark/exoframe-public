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
    const defaultModelName = config.agents.default_model;
    const providerInfo = ProviderFactory.getProviderInfoByName(config, defaultModelName);
    const llmProvider = ProviderFactory.createByName(config, defaultModelName);

    logger.info("llm.provider.initialized", providerInfo.id, {
      type: providerInfo.type,
      model: providerInfo.model,
      source: providerInfo.source,
      named_model: defaultModelName,
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

          // Step 5.12.2: Parse plan structure
          const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);

          if (!bodyMatch) {
            watcherLogger.error("plan.parsing_failed", event.path, {
              error: "No body section found after frontmatter",
              trace_id: frontmatter.trace_id,
            });
            return;
          }

          const body = bodyMatch[1];

          // Extract steps using regex
          const stepMatches = [...body.matchAll(
            /## Step (\d+): ([^\n]+)\n([\s\S]*?)(?=## Step \d+:|$)/g,
          )];

          if (stepMatches.length === 0) {
            watcherLogger.error("plan.parsing_failed", event.path, {
              error: "No steps found in plan body",
              trace_id: frontmatter.trace_id,
            });
            return;
          }

          // Validate step numbering is sequential
          const stepNumbers = stepMatches.map((m) => parseInt(m[1]));
          const isSequential = stepNumbers.every((num, idx) => num === idx + 1);

          if (!isSequential) {
            watcherLogger.warn("plan.non_sequential_steps", event.path, {
              trace_id: frontmatter.trace_id,
              step_numbers: stepNumbers,
              expected: Array.from({ length: stepNumbers.length }, (_, i) => i + 1),
            });
          }

          // Validate all steps have non-empty titles
          const hasEmptyTitle = stepMatches.some((m) => m[2].trim() === "");

          if (hasEmptyTitle) {
            watcherLogger.error("plan.parsing_failed", event.path, {
              error: "One or more steps have empty titles",
              trace_id: frontmatter.trace_id,
            });
            return;
          }

          // Build parsed plan structure
          const parsedSteps = stepMatches.map((match) => ({
            number: parseInt(match[1]),
            title: match[2].trim(),
            content: match[3].trim(),
          }));

          watcherLogger.info("plan.parsed", event.path, {
            trace_id: frontmatter.trace_id,
            request_id: frontmatter.request_id,
            agent: frontmatter.agent || "default",
            step_count: parsedSteps.length,
            steps: parsedSteps.map((s) => `${s.number}. ${s.title}`),
          });

          // Step 5.12.3: Execute plan
          const { PlanExecutor } = await import("./services/plan_executor.ts");

          // Use model override if specified in plan frontmatter
          let currentProvider = llmProvider;
          if (frontmatter.model) {
            try {
              currentProvider = ProviderFactory.createByName(config, frontmatter.model as string);
              watcherLogger.info("plan.model_override", frontmatter.model, {
                trace_id: frontmatter.trace_id,
              });
            } catch (error) {
              watcherLogger.warn("plan.model_override_failed", frontmatter.model, {
                error: error instanceof Error ? error.message : String(error),
                fallback: "using default provider",
              });
            }
          }

          const planExecutor = new PlanExecutor(config, currentProvider, dbService);

          const changesetId = await planExecutor.execute(event.path, {
            trace_id: frontmatter.trace_id as string,
            request_id: frontmatter.request_id as string,
            agent: (frontmatter.agent as string) || "default",
            frontmatter: frontmatter,
            steps: parsedSteps,
          });

          if (changesetId) {
            watcherLogger.info("plan.executed", event.path, {
              trace_id: frontmatter.trace_id,
              changeset_sha: changesetId,
            });
          } else {
            watcherLogger.warn("plan.executed_no_changes", event.path, {
              trace_id: frontmatter.trace_id,
            });
          }
        } catch (error) {
          watcherLogger.error("plan.execution_failed", event.path, {
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
