import { assertEquals, assertExists, assertThrows } from "jsr:@std/assert@^1.0.0";
import { ConfigService } from "../src/config/service.ts";
import { ConfigSchema } from "../src/config/schema.ts";
import { join } from "@std/path";

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

// ============================================================================
// ConfigService Error Handling Tests
// ============================================================================

Deno.test("ConfigService handles missing config file", async (t) => {
  await t.step("should create default config when file not found", () => {
    const tempPath = join(Deno.cwd(), "test-missing-config.toml");

    // Clean up if exists
    try {
      Deno.removeSync(tempPath);
    } catch {
      // Ignore if doesn't exist
    }

    // ConfigService should create default config
    const service = new ConfigService("test-missing-config.toml");
    const config = service.get();

    // Verify config has defaults (from the created default file)
    assertEquals(config.system.log_level, "info");
    assertEquals(config.paths.knowledge, "./Knowledge"); // From file
    assertEquals(config.paths.blueprints, "./Blueprints"); // From file

    // Verify file was created
    const fileExists = (() => {
      try {
        Deno.statSync(tempPath);
        return true;
      } catch {
        return false;
      }
    })();
    assertEquals(fileExists, true);

    // Clean up
    try {
      Deno.removeSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  await t.step("should compute checksum for created default config", () => {
    const tempPath = join(Deno.cwd(), "test-checksum-config.toml");

    // Clean up if exists
    try {
      Deno.removeSync(tempPath);
    } catch {
      // Ignore
    }

    const service = new ConfigService("test-checksum-config.toml");
    const checksum = service.getChecksum();

    // Checksum should be computed for the created file
    assertEquals(typeof checksum, "string");
    assertEquals(checksum.length > 0, true);

    // Clean up
    try {
      Deno.removeSync(tempPath);
    } catch {
      // Ignore
    }
  });
});

Deno.test("ConfigService handles invalid TOML syntax", () => {
  const tempPath = join(Deno.cwd(), "test-invalid-toml.toml");

  // Create file with invalid TOML
  Deno.writeTextFileSync(tempPath, "[system\nthis is not valid TOML");

  try {
    assertThrows(
      () => {
        new ConfigService("test-invalid-toml.toml");
      },
      Error,
    );
  } finally {
    // Clean up
    try {
      Deno.removeSync(tempPath);
    } catch {
      // Ignore
    }
  }
});

Deno.test("ConfigService handles validation errors", async (t) => {
  await t.step("should exit on missing required fields", () => {
    const tempPath = join(Deno.cwd(), "test-missing-fields.toml");

    // Create config missing required system.version
    Deno.writeTextFileSync(
      tempPath,
      `
[system]
log_level = "info"
    `.trim(),
    );

    try {
      // Mock Deno.exit to prevent actual exit
      const originalExit = Deno.exit;
      let exitCalled = false;
      let exitCode = 0;

      (Deno.exit as any) = (code: number) => {
        exitCalled = true;
        exitCode = code;
        throw new Error(`Exit called with code ${code}`);
      };

      try {
        assertThrows(() => {
          new ConfigService("test-missing-fields.toml");
        });
        assertEquals(exitCalled, true);
        assertEquals(exitCode, 1);
      } finally {
        Deno.exit = originalExit;
      }
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should exit on invalid field types", () => {
    const tempPath = join(Deno.cwd(), "test-invalid-types.toml");

    // Create config with invalid log_level
    Deno.writeTextFileSync(
      tempPath,
      `
[system]
version = "1.0.0"
log_level = "invalid_level"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"
    `.trim(),
    );

    try {
      const originalExit = Deno.exit;
      let exitCalled = false;

      (Deno.exit as any) = (code: number) => {
        exitCalled = true;
        throw new Error(`Exit called with code ${code}`);
      };

      try {
        assertThrows(() => {
          new ConfigService("test-invalid-types.toml");
        });
        assertEquals(exitCalled, true);
      } finally {
        Deno.exit = originalExit;
      }
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should exit on invalid timeout value", () => {
    const tempPath = join(Deno.cwd(), "test-invalid-timeout.toml");

    Deno.writeTextFileSync(
      tempPath,
      `
[system]
log_level = "info"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"

[agents]
timeout_sec = -5
    `.trim(),
    );

    try {
      const originalExit = Deno.exit;
      let exitCalled = false;

      (Deno.exit as any) = (code: number) => {
        exitCalled = true;
        throw new Error(`Exit called with code ${code}`);
      };

      try {
        assertThrows(() => {
          new ConfigService("test-invalid-timeout.toml");
        });
        assertEquals(exitCalled, true);
      } finally {
        Deno.exit = originalExit;
      }
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });
});

Deno.test("ConfigService handles edge cases", async (t) => {
  await t.step("should handle empty config file", () => {
    const tempPath = join(Deno.cwd(), "test-empty-config.toml");

    // Empty TOML file will throw a parse error
    Deno.writeTextFileSync(tempPath, "");

    try {
      // Empty file causes TOML parse error, not validation error
      assertThrows(
        () => {
          new ConfigService("test-empty-config.toml");
        },
        Error,
        "Parse error",
      );
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should handle config with comments", () => {
    const tempPath = join(Deno.cwd(), "test-comments-config.toml");

    Deno.writeTextFileSync(
      tempPath,
      `
# This is a comment
[system]
version = "1.0.0"
log_level = "info"  # inline comment

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"
    `.trim(),
    );

    try {
      const service = new ConfigService("test-comments-config.toml");
      const config = service.get();

      assertEquals(config.system.version, "1.0.0");
      assertEquals(config.system.log_level, "info");
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should handle config with extra unknown fields", () => {
    const tempPath = join(Deno.cwd(), "test-extra-fields.toml");

    Deno.writeTextFileSync(
      tempPath,
      `
[system]
version = "1.0.0"
log_level = "info"
unknown_field = "should be ignored"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"

[unknown_section]
foo = "bar"
    `.trim(),
    );

    try {
      const service = new ConfigService("test-extra-fields.toml");
      const config = service.get();

      // Should load successfully, extra fields ignored
      assertEquals(config.system.version, "1.0.0");
      assertEquals(config.system.log_level, "info");
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should handle config with unicode in paths", () => {
    const tempPath = join(Deno.cwd(), "test-unicode-config.toml");

    Deno.writeTextFileSync(
      tempPath,
      `
[system]
version = "1.0.0"
log_level = "info"

[paths]
knowledge = "./Знание"
blueprints = "./蓝图"
system = "./系統"
    `.trim(),
    );

    try {
      const service = new ConfigService("test-unicode-config.toml");
      const config = service.get();

      assertEquals(config.paths.knowledge, "./Знание");
      assertEquals(config.paths.blueprints, "./蓝图");
      assertEquals(config.paths.system, "./系統");
    } finally {
      try {
        Deno.removeSync(tempPath);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should compute consistent checksums", () => {
    const content = `[system]
log_level = "info"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"`;

    const tempPath1 = join(Deno.cwd(), "test-checksum-1.toml");
    const tempPath2 = join(Deno.cwd(), "test-checksum-2.toml");

    try {
      Deno.writeTextFileSync(tempPath1, content);
      Deno.writeTextFileSync(tempPath2, content);

      const service1 = new ConfigService("test-checksum-1.toml");
      const service2 = new ConfigService("test-checksum-2.toml");

      // Same content should produce same checksum
      assertEquals(service1.getChecksum(), service2.getChecksum());
      assertEquals(service1.getChecksum().length, 64); // SHA-256 hex
    } finally {
      try {
        Deno.removeSync(tempPath1);
        Deno.removeSync(tempPath2);
      } catch {
        // Ignore
      }
    }
  });

  await t.step("should compute different checksums for different content", () => {
    const tempPath1 = join(Deno.cwd(), "test-checksum-diff-1.toml");
    const tempPath2 = join(Deno.cwd(), "test-checksum-diff-2.toml");

    try {
      Deno.writeTextFileSync(
        tempPath1,
        `[system]
log_level = "info"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"`,
      );

      Deno.writeTextFileSync(
        tempPath2,
        `[system]
log_level = "debug"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"`,
      );

      const service1 = new ConfigService("test-checksum-diff-1.toml");
      const service2 = new ConfigService("test-checksum-diff-2.toml");

      // Different content should produce different checksums
      assertEquals(
        service1.getChecksum() !== service2.getChecksum(),
        true,
      );
    } finally {
      try {
        Deno.removeSync(tempPath1);
        Deno.removeSync(tempPath2);
      } catch {
        // Ignore
      }
    }
  });
});
