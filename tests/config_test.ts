import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { ConfigService } from "../src/config/service.ts";
import { ConfigSchema } from "../src/config/schema.ts";

Deno.test("ConfigSchema accepts valid minimal config", () => {
  const validConfig = {
    system: {
      version: "1.0.0",
      log_level: "info",
    },
    paths: {
      knowledge: "./Knowledge",
      blueprints: "./Blueprints",
      system: "./System",
    },
  };

  const result = ConfigSchema.safeParse(validConfig);
  assertEquals(result.success, true);
});

Deno.test("ConfigSchema rejects invalid log_level", () => {
  const invalidConfig = {
    system: {
      log_level: "invalid",
    },
    paths: {
      knowledge: "./Knowledge",
    },
  };

  const result = ConfigSchema.safeParse(invalidConfig);
  assertEquals(result.success, false);
});

Deno.test("ConfigSchema applies defaults for missing agents section", () => {
  const configWithoutAgents = {
    system: {
      version: "1.0.0",
      log_level: "info",
    },
    paths: {
      knowledge: "./Knowledge",
      blueprints: "./Blueprints",
      system: "./System",
    },
  };

  const result = ConfigSchema.parse(configWithoutAgents);
  assertEquals(result.agents.default_model, "gpt-4o");
  assertEquals(result.agents.timeout_sec, 60);
});

Deno.test("ConfigSchema applies defaults for missing watcher section", () => {
  const configWithoutWatcher = {
    system: {
      version: "1.0.0",
      log_level: "info",
    },
    paths: {
      knowledge: "./Knowledge",
      blueprints: "./Blueprints",
      system: "./System",
    },
  };

  const result = ConfigSchema.parse(configWithoutWatcher);
  assertEquals(result.watcher.debounce_ms, 200);
  assertEquals(result.watcher.stability_check, true);
});

Deno.test("ConfigService computes checksum", () => {
  const service = new ConfigService("exo.config.toml");
  const checksum = service.getChecksum();

  assertExists(checksum);
  assertEquals(checksum.length, 64); // SHA-256 produces 64 hex chars
});

Deno.test("ConfigService loads config successfully", () => {
  const service = new ConfigService("exo.config.toml");
  const config = service.get();

  assertExists(config.system);
  assertExists(config.paths);
  assertEquals(config.system.log_level, "info");
});
