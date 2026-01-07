
## Phase 1: The Iron Skeleton (Runtime & Storage) ✅ COMPLETED

**Goal:** A running Deno daemon that can write to the database, read configuration, and establish the physical storage
structure.

### Step 1.1: Project Scaffold & Deno Configuration ✅ COMPLETED

- **Dependencies:** none — **Rollback:** delete generated config files.
- **Action:** Initialize repository. Create `deno.json` with strict tasks (e.g., `deno task start`) and record a
  deterministic `deno.lock` file.
- **Justification:** Establishes the Deno security sandbox immediately. We want to fail early if permissions are too
  tight.

**Success Criteria:**

**Core Functionality:**

1. [x] `deno task start` runs `main.ts` and prints "ExoFrame Daemon Active"
2. [x] Process fails with PermissionDenied when required permissions removed from `deno.json`
3. [x] `deno.lock` file generated and committed to version control

**Code Quality:**
4. [x] `deno task fmt:check` passes with no formatting issues
5. [x] `deno task lint` passes with no linting errors
6. [x] CI pipeline runs both checks automatically

7. [x] Complete Deno configuration created with security sandbox and task definitions

**Implementation:** See `deno.json` in project root for complete configuration with:

- Strict permission flags (read, write, net, env, run)
- Task definitions (start, dev, test, lint, fmt)
- Import maps for dependencies (@std/fs, @std/path, @std/toml, @db/sqlite, zod)
- Compiler options with strict type checking

### Running tests (developer guide)

Use Deno's test runner to execute unit and integration tests. Tests may spawn subprocesses (`deno`, `bash`, `sqlite3`)
and inspect the deployed workspace, so grant the required permissions when running locally or in CI.

- Recommended (run all tests locally with explicit permissions):

```bash
# from the repository root
deno test --allow-run --allow-read --allow-write
```

- Preferred via task (if `deno.json` includes a `test` task):

```bash
deno task test
```

- Notes:
  - `--allow-run` is required so tests can invoke `deno`/`bash`/`sqlite3` when exercising scripts like
    `scripts/setup_db.ts` and `scripts/deploy_workspace.sh`.
  - `--allow-read` / `--allow-write` allow tests to create temporary workspaces and inspect generated files (e.g.,
    `System/journal.db`).
  - On CI, prefer adding only the minimum permissions required and run tests inside an isolated container (Ubuntu) with
    `sqlite3` installed for full schema checks. If `sqlite3` is missing, some tests will fall back to lighter checks
    (file existence / non-zero size).

Add a `deno.json` `test` task for convenience so contributors can run `deno task test` without remembering flags.

### Step 1.2: The Activity Journal (SQLite) ✅ COMPLETED

- **Dependencies:** Step 1.1 — **Rollback:** drop `journal.db`, run `deno task migrate down`.
- **Action:** Implement Database Service using `jsr:@db/sqlite`. Create migration scripts for `activity` and `leases`
  tables and codify WAL/foreign key pragmas in `scripts/setup_db.ts`.
- **Justification:** Every future step relies on logging. The "Brain's Memory" must be active before the Brain itself.

**Success Criteria:**

**Core Functionality:**

1. [x] Database file created at `/System/journal.db` with WAL mode enabled
2. [x] `activity` table with trace_id, actor, agent_id, action_type, payload, timestamp
3. [x] `leases` table for file locking with TTL expiration
4. [x] `schema_version` table for migration tracking

**Database Operations:**
5. [x] Insert structured log entry and retrieve by trace_id
6. [x] Query by actor (agent/human/system) and agent_id
7. [x] Lease acquisition and expiration working correctly

**Migration System:**
8. [x] `deno task migrate up` applies schema changes cleanly
9. [x] `deno task migrate down` reverts changes without errors
10. [x] Migration history tracked in schema_version table

**Schema:**

```sql
CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  actor TEXT NOT NULL,              -- 'agent', 'human', 'system'
  agent_id TEXT,                    -- Specific agent: 'senior-coder', 'security-auditor', NULL for human/system
  action_type TEXT NOT NULL,
  payload JSON NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_trace ON activity(trace_id);
CREATE INDEX idx_activity_time ON activity(timestamp);
CREATE INDEX idx_activity_actor ON activity(actor);
CREATE INDEX idx_activity_agent ON activity(agent_id);

-- File Leases: Prevents concurrent modifications
CREATE TABLE leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL      -- TTL: acquired_at + 60 seconds
);

CREATE INDEX idx_leases_expires ON leases(expires_at);

-- Schema version tracking (for migrations)
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version) VALUES (1);
```

### Step 1.3: Configuration Loader (TOML + Zod) ✅ COMPLETED

- **Dependencies:** Step 1.2 — **Rollback:** revert config schema, restore previous TOML.
- **Action:** Create `ConfigService`. Define Zod schemas for `exo.config.toml`. Include config checksum in Activity
  Journal for auditability.
- **Justification:** Hardcoding paths is technical debt. We need a single source of truth for system physics.

**Success Criteria:**

**Core Functionality:**

1. [x] ConfigService loads `exo.config.toml` on system startup
2. [x] Zod schema validates all required configuration fields
3. [x] Readable error messages for malformed TOML or missing keys
4. [x] Config checksum logged to Activity Journal for auditability

**Configuration Validation:**
5. [x] System paths (Knowledge, Inbox, System, Blueprints) validated
6. [x] LLM provider settings validated (API keys, endpoints)
7. [x] Watcher settings validated (debounce_ms, file patterns)

### Step 1.4: The Knowledge Vault Scaffold ✅ COMPLETED

- **Dependencies:** Step 1.3 — **Rollback:** remove created folders/files (idempotent).
- **Action:** Create rigid directory structure for the Obsidian Vault:
  - `/Knowledge/Context` (Read-Only memory)
  - `/Knowledge/Reports` (Write-Only memory)
  - `/Knowledge/Portals` (Auto-generated Context Cards)
- **Justification:** This folder _is_ the physical memory. If it doesn't exist, Agents have nowhere to look for rules.

**Success Criteria:**

**Directory Structure:**

1. [x] `/Knowledge` directory created as vault root
2. [x] `/Knowledge/Context` directory for read-only reference files
3. [x] `/Knowledge/Reports` directory for agent-generated mission reports
4. [x] `/Knowledge/Portals` directory for auto-generated context cards

**Documentation:**
5. [x] `README.md` created in `/Knowledge` explaining Obsidian integration
6. [x] Setup script is idempotent (safe to run multiple times)

---
