# ExoFrame Manual Test Scenarios

- **Version:** 1.7.0
- **Release Date:** 2025-12-02
- **Status:** Active
- **Reference:** [Testing Strategy](./ExoFrame_Testing_Strategy.md) Section 2.4

---

## Overview

This document contains detailed manual test scenarios for ExoFrame. Each scenario includes:

- **Preconditions** — Required setup before testing
- **Steps** — Exact commands to execute
- **Expected Results** — What should happen
- **Verification** — How to confirm success
- **Cleanup** — How to reset for next test

Execute these scenarios on each target platform before major releases.

---

## Test Environment Setup

### Prerequisites

```bash
# Verify Deno is installed (v2.x required)
deno --version

# Clone ExoFrame repository (if fresh install test)
git clone https://github.com/dostark/exoframe.git
cd exoframe

# Or use existing workspace
cd ~/ExoFrame
```

### Environment Variables

```bash
# For tests using real LLM (scenario MT-10)
export ANTHROPIC_API_KEY="your-api-key"
# OR
export OPENAI_API_KEY="your-api-key"
```

---

## Scenario MT-01: Fresh Installation

**Purpose:** Verify ExoFrame can be installed and initialized on a clean system.

### Preconditions

- Fresh system or clean user account
- Deno v2.x installed
- No existing ExoFrame installation

### Steps

```bash
# Step 1: Clone the repository
git clone https://github.com/dostark/exoframe.git
cd exoframe

# Step 2: Deploy workspace using the deploy script (recommended)
./scripts/deploy_workspace.sh ~/ExoFrame

# Step 3: Navigate to workspace and verify CLI
cd ~/ExoFrame
exoctl --help
```

### Expected Results

**Step 1:**

- Repository cloned successfully
- All files present in `exoframe/` directory

**Step 2:**

- Deploy script completes without errors
- Creates runtime folders (`System`, `Knowledge`, `Inbox`, `Portals`)
- Copies runtime artifacts to target workspace
- Runs `deno task cache` and `deno task setup` automatically
- Installs `exoctl` CLI globally to `~/.deno/bin/`

**Step 3:**

- Shows available exoctl commands
- Should include: `daemon`, `request`, `plan`, `blueprint`, `portal`, etc.

### Verification

```bash
# Check directory structure was created
ls -la ~/ExoFrame/
# Expected: Blueprints/ Inbox/ Knowledge/ Portals/ System/

ls -la ~/ExoFrame/System/
# Expected: Active/ Archive/ Templates/ journal.db

# Check config file exists
cat ~/ExoFrame/exo.config.toml

# Verify exoctl is installed
exoctl --help
```

### Pass Criteria

- [ ] All directories created (Blueprints, Inbox, Knowledge, Portals, System)
- [ ] Config file exists and is valid TOML
- [ ] Database initialized (`System/journal.db`)
- [ ] `exoctl` CLI accessible
- [ ] No error messages during setup

---

## Scenario MT-02: Daemon Startup

**Purpose:** Verify the daemon starts correctly and creates required resources.

### Preconditions

- ExoFrame installed (MT-01 complete)
- No daemon currently running

### Steps

```bash
# Step 1: Navigate to workspace
cd ~/ExoFrame

# Step 2: Start daemon in foreground (for visibility)
exoctl daemon start

# Step 3: Wait for startup (2-3 seconds)
sleep 3

# Step 4: Check daemon status
exoctl daemon status
```

### Expected Results

**Step 2:**

- Daemon starts without errors
- Output shows: "ExoFrame daemon started"
- Shows watching directories

**Step 3:**

- No crash or error messages

**Step 4:**

- Shows daemon is running with status info
- Shows PID and uptime

### Verification

```bash
# Check process is running
pgrep -f "exoframe" || ps aux | grep exoframe

# Check database was created
ls -la ~/ExoFrame/System/journal.db

# Check log output
tail -20 ~/ExoFrame/System/daemon.log
```

### Cleanup

```bash
# Stop the daemon
exoctl daemon stop
# OR kill the process
pkill -f "exoframe"
```

### Pass Criteria

- [ ] Daemon process running
- [ ] Database file created
- [ ] `exoctl daemon status` shows "Running"
- [ ] No error messages in logs

---

## Scenario MT-03: Blueprint Management

**Purpose:** Verify blueprint creation, validation, editing, and removal work correctly.

### Preconditions

- ExoFrame workspace deployed at `~/ExoFrame`
- Database initialized
- No existing test blueprints

### Steps

````bash
# Step 1: List existing blueprints (should be empty or only defaults)
cd ~/ExoFrame
exoctl blueprint list

# Step 2: Create a blueprint from scratch
exoctl blueprint create test-agent \
  --name "Test Agent" \
  --model "ollama:codellama:13b" \
  --description "Test agent for manual scenarios"

# Step 3: Create a blueprint using template
exoctl blueprint create coder-test \
  --name "Test Coder" \
  --template coder

# Step 4: List blueprints again
exoctl blueprint list

# Step 5: Show blueprint details
exoctl blueprint show test-agent

# Step 6: Validate blueprint
exoctl blueprint validate test-agent

# Step 7: Create blueprint with custom system prompt
cat > /tmp/custom-prompt.txt << 'EOF'
# Custom Test Agent

You are a test agent.

## Output Format

```xml
<thought>
Test reasoning
</thought>

<content>
Test content
</content>
````

EOF

exoctl blueprint create custom-test \
  --name "Custom Test" \
  --model "mock:test-model" \
  --system-prompt-file /tmp/custom-prompt.txt

# Step 8: Validate custom blueprint

exoctl blueprint validate custom-test

# Step 9: Create an invalid blueprint manually

cat > ~/ExoFrame/Blueprints/Agents/invalid-test.md << 'EOF'
+++
name = "Missing agent_id"
model = "ollama:llama2"
+++

Invalid blueprint without agent_id
EOF

# Step 10: Try to validate invalid blueprint

exoctl blueprint validate invalid-test

# Step 11: Test reserved name rejection

exoctl blueprint create system \
  --name "System Agent" \
  --model "ollama:llama2" 2>&1 || echo "Expected: Reserved name rejected"

# Step 12: Test duplicate rejection

exoctl blueprint create test-agent \
  --name "Duplicate Test" \
  --model "ollama:llama2" 2>&1 || echo "Expected: Duplicate rejected"

# Step 13: Test edit command (requires EDITOR)

export EDITOR="cat" # Use cat to just display without editing
exoctl blueprint edit test-agent

# Step 14: Use blueprint in a request

exoctl blueprint create mock-agent --name "Mock Agent" --template mock
exoctl request "Test request for manual scenario" --agent mock-agent

# Step 15: Remove blueprints

exoctl blueprint remove custom-test --force
exoctl blueprint remove coder-test --force
exoctl blueprint remove mock-agent --force
exoctl blueprint remove test-agent --force
exoctl blueprint remove invalid-test --force

````
### Expected Results

**Step 1:**
- Shows list of blueprints (may be empty)
- No errors

**Step 2:**
- Blueprint created successfully
- File created at `~/ExoFrame/Blueprints/Agents/test-agent.md`
- Success message with path shown
- Activity logged

**Step 3:**
- Blueprint created with coder template defaults
- Model: `anthropic:claude-sonnet`
- Capabilities include `code_generation`

**Step 4:**
- Shows both `test-agent` and `coder-test`
- Displays model and capabilities for each

**Step 5:**
- Shows full blueprint details
- Displays: agent_id, name, model, capabilities, created, created_by, version
- Shows full system prompt content

**Step 6:**
- Validation passes
- Shows: "Blueprint 'test-agent' is valid"
- Lists validation checks passed (frontmatter, fields, tags)

**Step 7:**
- Blueprint created with custom system prompt from file
- File content matches custom-prompt.txt

**Step 8:**
- Validation passes
- Confirms `<thought>` and `<content>` tags present

**Step 9:**
- Invalid blueprint file created manually

**Step 10:**
- Validation fails
- Error mentions missing `agent_id` field
- Lists validation errors clearly

**Step 11:**
- Command fails with error
- Error message: "'system' is a reserved agent_id"
- Lists reserved names

**Step 12:**
- Command fails with error
- Error message: "Blueprint 'test-agent' already exists"
- Suggests using `exoctl blueprint edit` instead

**Step 13:**
- Opens blueprint in $EDITOR (or displays with cat)
- Shows full blueprint content

**Step 14:**
- Request created successfully
- Uses mock-agent blueprint
- Request file references mock-agent in frontmatter

**Step 15:**
- All blueprints removed successfully
- Files deleted from Blueprints/Agents/
- Activity logged for each removal

### Verification

```bash
# Check blueprint files were created
ls -la ~/ExoFrame/Blueprints/Agents/
# Expected: test-agent.md, coder-test.md, custom-test.md, mock-agent.md, invalid-test.md

# Check TOML frontmatter format
head -20 ~/ExoFrame/Blueprints/Agents/test-agent.md
# Expected: Starts with +++, has TOML fields, ends with +++

# Check system prompt from file was loaded
grep "Custom Test Agent" ~/ExoFrame/Blueprints/Agents/custom-test.md
# Expected: Custom prompt content present

# Check Activity Journal logged blueprint operations
sqlite3 ~/ExoFrame/System/journal.db "SELECT action_type, target FROM activity WHERE action_type LIKE 'blueprint.%' ORDER BY timestamp DESC LIMIT 10;"
# Expected: blueprint.created, blueprint.edited, blueprint.removed entries

# Verify blueprints were removed
ls ~/ExoFrame/Blueprints/Agents/*.md 2>/dev/null | grep -E "(test-agent|coder-test|custom-test|mock-agent)" || echo "All test blueprints removed"
# Expected: No test blueprint files remain

# Check request was created with custom agent
cat ~/ExoFrame/Inbox/Requests/request-*.md | grep "mock-agent"
# Expected: Request references mock-agent
````

### Cleanup

```bash
# Remove any remaining test blueprints
rm -f ~/ExoFrame/Blueprints/Agents/test-agent.md
rm -f ~/ExoFrame/Blueprints/Agents/coder-test.md
rm -f ~/ExoFrame/Blueprints/Agents/custom-test.md
rm -f ~/ExoFrame/Blueprints/Agents/mock-agent.md
rm -f ~/ExoFrame/Blueprints/Agents/invalid-test.md

# Remove custom prompt file
rm -f /tmp/custom-prompt.txt

# Remove test request
rm -f ~/ExoFrame/Inbox/Requests/request-*.md

# Reset EDITOR
unset EDITOR
```

### Pass Criteria

- [ ] `exoctl blueprint list` shows all blueprints
- [ ] `exoctl blueprint create` generates valid TOML frontmatter
- [ ] Template system applies correct defaults (model, capabilities)
- [ ] `--system-prompt-file` loads content from file
- [ ] `exoctl blueprint show` displays full blueprint
- [ ] `exoctl blueprint validate` detects schema errors
- [ ] Validation requires `<thought>` and `<content>` tags
- [ ] Reserved names (`system`, `test`) are rejected
- [ ] Duplicate agent_id names are rejected
- [ ] `exoctl blueprint edit` opens in $EDITOR
- [ ] Blueprints can be used in `exoctl request --agent`
- [ ] `exoctl blueprint remove` deletes files
- [ ] All operations logged to Activity Journal
- [ ] Invalid frontmatter detected during validation
- [ ] Clear error messages for all failure cases

---

## Scenario MT-04: Create Request

**Purpose:** Verify request creation via CLI works correctly.

### Preconditions

- Daemon running (MT-02 complete)
- Default blueprint available (may have been removed in MT-03 cleanup)

### Steps

```bash
# Step 1: Create default blueprint (if not exists)
exoctl blueprint create default \
  --name "Default Agent" \
  --template default

# Step 2: Create a simple request
exoctl request "Add a hello world function to utils.ts"

# Step 3: List requests
exoctl request list

# Step 4: Verify request file
ls -la ~/ExoFrame/Inbox/Requests/
```

### Expected Results

**Step 1:**

- Blueprint created successfully (or already exists message)
- Default agent available for requests

**Step 2:**

- Command completes successfully
- Shows trace ID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- Shows file path created (e.g., `request-a1b2c3d4.md`)

**Step 3:**

- Lists the created request
- Shows status: `pending`
- Shows trace ID

**Step 4:**

- Request file exists with `.md` extension
- Filename format: `request-<trace-id-prefix>.md`

### Verification

```bash
# Read the request file
cat ~/ExoFrame/Inbox/Requests/request-*.md

# Expected content (YAML frontmatter):
# ---
# trace_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
# created: "2025-12-01T10:00:00.000Z"
# status: pending
# priority: normal
# agent: default
# source: cli
# created_by: "user@example.com"
# ---
#
# # Request
#
# Add a hello world function to utils.ts
```

### Cleanup

```bash
# Remove test request if not proceeding to MT-05
rm -f ~/ExoFrame/Inbox/Requests/request-*.md
```

### Pass Criteria

- [ ] Request file created in `Inbox/Requests/`
- [ ] Valid YAML frontmatter with trace_id
- [ ] Request content matches input
- [ ] `exoctl request list` shows the request

---

## Scenario MT-05: Plan Generation (Mock LLM)

**Purpose:** Verify the daemon generates a plan from a request using mock LLM.

### Preconditions

- Daemon running with mock LLM (default in dev mode)
- Request created (MT-04 complete)

### Steps

```bash
# Step 1: Verify daemon is running
exoctl daemon status

# Step 2: Check for plan (may need to wait)
sleep 5
exoctl plan list

# Step 3: View the generated plan
exoctl plan show <plan-id>

# Step 4: Verify plan file
ls -la ~/ExoFrame/Inbox/Plans/
```

### Expected Results

**Step 1:**

- Daemon status shows "Running"
- If not running, start with: `exoctl daemon start`

**Step 2:**

- Shows plan in list
- Status: `review`

**Step 3:**

- Shows plan details
- Includes proposed steps
- Shows associated request ID

**Step 4:**

- Plan file exists in `Inbox/Plans/`

### Verification

```bash
# Read the plan file
cat ~/ExoFrame/Inbox/Plans/PLAN-*.md

# Expected structure (YAML frontmatter):
# ---
# trace_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
# request_id: "implement-auth"
# status: review
# created_at: "2025-12-01T10:01:00.000Z"
# agent_id: default
# ---
#
# ## Proposed Plan
#
# 1. Create utils.ts file
# 2. Add hello world function
# ...
```

### Troubleshooting

If no plans are generated after 30 seconds:

```bash
# Check daemon logs for errors
tail -50 ~/ExoFrame/System/daemon.log

# Check if request processor is running
grep -i "request.*processing\|watcher\|detected" ~/ExoFrame/System/daemon.log | tail -20

# Verify request file is valid
cat ~/ExoFrame/Inbox/Requests/request-*.md

# Try restarting daemon
exoctl daemon stop
exoctl daemon start
sleep 5
exoctl plan list
```

### Pass Criteria

- [ ] Plan generated within 30 seconds
- [ ] Plan linked to original request
- [ ] Plan contains actionable steps

---

## Scenario MT-06: Plan Approval

**Purpose:** Verify plan approval workflow moves plan to active state.

### Preconditions

- Plan exists in review status (MT-05 complete)

### Steps

```bash
# Step 1: List plans in review
exoctl plan list --status review

# Step 2: Approve the plan
exoctl plan approve <plan-id>

# Step 3: Verify plan moved
exoctl plan list --status approved
ls -la ~/ExoFrame/System/Active/
```

### Expected Results

**Step 1:**

- Shows plan(s) awaiting review

**Step 2:**

- Confirmation message
- Shows plan status changed to `approved`

**Step 3:**

- Plan appears in approved list
- Plan file moved to `System/Active/`

### Verification

```bash
# Check plan is no longer in Inbox
ls ~/ExoFrame/Inbox/Plans/ | grep <plan-id>  # Should be empty

# Check plan is in Active
ls ~/ExoFrame/System/Active/ | grep <plan-id>  # Should show file

# Read moved plan file
cat ~/ExoFrame/System/Active/PLAN-*.md
# Frontmatter should show: status: approved
```

### Pass Criteria

- [ ] Plan status changed to `approved`
- [ ] Plan file moved to `System/Active/`
- [ ] Original request updated

---

## Scenario MT-07: Plan Rejection

**Purpose:** Verify plan rejection workflow archives the plan.

### Preconditions

- Fresh request and plan (create new ones)
- Plan in review status

### Steps

```bash
# Step 1: Create a new request
exoctl request "Create a test feature"

# Step 2: Wait for plan generation
sleep 5
exoctl plan list --status review

# Step 3: Reject the plan with reason
exoctl plan reject <plan-id> --reason "Needs different approach"

# Step 4: Verify plan archived
exoctl plan list --status rejected
ls -la ~/ExoFrame/System/Archive/
```

### Expected Results

**Step 3:**

- Confirmation message
- Shows plan status: `rejected`

**Step 4:**

- Plan appears in rejected list
- Plan file in `System/Archive/`

### Verification

```bash
# Read archived plan
cat ~/ExoFrame/System/Archive/PLAN-*.md

# Should contain:
# status: rejected
# rejection_reason: Needs different approach
```

### Pass Criteria

- [ ] Plan status changed to `rejected`
- [ ] Plan moved to `System/Archive/`
- [ ] Rejection reason recorded

---

## Scenario MT-08: Plan Execution (Mock LLM)

**Purpose:** Verify approved plan executes and generates changeset.

### Preconditions

- Approved plan exists (MT-06 complete or create new)
- Daemon running

### Steps

```bash
# Step 1: If needed, approve a plan
exoctl plan approve <plan-id>

# Step 2: Wait for execution (mock is fast)
sleep 10

# Step 3: Check for changeset (agent-created branch)
exoctl changeset list
exoctl changeset show <changeset-id>

# Step 4: Verify git branch created
exoctl git branches
```

### Expected Results

**Step 2:**

- Execution completes (visible in daemon logs)
- No errors during execution

**Step 3:**

- Changeset created and listed
- Shows files changed, branch name, commits

**Step 4:**

- Feature branch exists (e.g., `feat/add-hello-world-a1b2c3d4`)

### Verification

```bash
# Check changeset details
exoctl changeset show <changeset-id>
# Shows: branch name, files changed, commit list, diff preview

# Check git branch exists
exoctl git branches --pattern "feat/*"
# Should list the agent-created branch

# Check daemon logs for execution
tail -50 ~/ExoFrame/System/daemon.log | grep -i "execution\|completed"
```

### Pass Criteria

- [ ] Changeset created after execution
- [ ] Git branch created with trace_id in name
- [ ] `exoctl changeset list` shows pending changeset
- [ ] Daemon logs show successful execution

---

## Scenario MT-09: Portal Management

**Purpose:** Verify portal (external project) can be mounted and accessed.

### Preconditions

- ExoFrame running
- External project directory exists

### Steps

```bash
# Step 1: Create a test external project
mkdir -p /tmp/test-project
echo "# Test Project" > /tmp/test-project/README.md
echo "export const version = '1.0';" > /tmp/test-project/index.ts

# Step 2: Mount the portal
exoctl portal add /tmp/test-project TestProject

# Step 3: Verify portal created
exoctl portal list
ls -la ~/ExoFrame/Portals/

# Step 4: Verify symlink works
cat ~/ExoFrame/Portals/TestProject/README.md
```

### Expected Results

**Step 2:**

- Portal added successfully
- Shows portal name and path

**Step 3:**

- TestProject appears in portal list
- Symlink created in `Portals/`

**Step 4:**

- Can read files through symlink
- Content matches original

### Verification

```bash
# Check symlink
ls -la ~/ExoFrame/Portals/TestProject
# Should show: TestProject -> /tmp/test-project

# Verify context card generated
cat ~/ExoFrame/Knowledge/Portals/TestProject.md
```

### Cleanup

```bash
# Remove portal
exoctl portal remove TestProject

# Verify removal
ls ~/ExoFrame/Portals/ | grep TestProject  # Should be empty

# Clean up test project
rm -rf /tmp/test-project
```

### Pass Criteria

- [ ] Portal symlink created
- [ ] Files accessible through portal
- [ ] Context card generated
- [ ] Portal can be removed

---

## Scenario MT-10: Daemon Crash Recovery

**Purpose:** Verify daemon recovers gracefully after unexpected termination.

### Preconditions

- Daemon running with active operations
- At least one request in progress (optional)

### Steps

```bash
# Step 1: Get daemon PID
DAEMON_PID=$(pgrep -f "exoframe")
echo "Daemon PID: $DAEMON_PID"

# Step 2: Force kill the daemon (simulate crash)
kill -9 $DAEMON_PID

# Step 3: Verify daemon is dead
pgrep -f "exoframe" || echo "Daemon stopped"

# Step 4: Restart daemon
cd ~/ExoFrame
exoctl daemon start
sleep 3

# Step 5: Check status
exoctl daemon status
```

### Expected Results

**Step 2:**

- Daemon terminates immediately

**Step 4:**

- Daemon restarts successfully
- Shows recovery messages (if any)
- Resumes watching directories

**Step 5:**

- Status shows daemon healthy
- Previous state recovered

### Verification

```bash
# Check daemon is running
exoctl daemon status
# Should show: Status: Running ✓

# Check database integrity
sqlite3 ~/ExoFrame/System/journal.db "PRAGMA integrity_check;"
# Should show: ok

# Verify requests still tracked
exoctl request list
```

### Pass Criteria

- [ ] Daemon restarts without errors
- [ ] `exoctl daemon status` shows Running
- [ ] Database remains intact
- [ ] Previous requests still visible

---

## Scenario MT-11: Real LLM Integration

**Purpose:** Verify ExoFrame works with real LLM API (Anthropic or OpenAI).

### Preconditions

- Valid API key set in environment
- Daemon NOT running (will start with real LLM)

### Steps

```bash
# Step 1: Set API key (if not already)
export ANTHROPIC_API_KEY="sk-ant-..."
# OR
export OPENAI_API_KEY="sk-..."

# Step 2: Start daemon with real LLM
EXO_LLM_PROVIDER=anthropic deno task start:fg &
# OR
EXO_LLM_PROVIDER=openai deno task start:fg &

# Step 3: Wait for startup
sleep 5

# Step 4: Create a test request
exoctl request "Create a simple TypeScript function that adds two numbers"

# Step 5: Wait for plan (real LLM takes longer)
sleep 30
exoctl plan list
```

### Expected Results

**Step 2:**

- Daemon starts with real LLM provider
- Shows provider name in startup log

**Step 4:**

- Request created successfully

**Step 5:**

- Plan generated by real LLM
- Plan contains detailed, coherent steps
- Tokens used are logged

### Verification

```bash
# Check plan quality
exoctl plan show <plan-id>
# Plan should be more detailed than mock responses

# Check daemon logs for token usage
grep -i "token\|api" ~/ExoFrame/System/daemon.log
# Should show non-zero token counts

# Check API calls logged
grep -i "anthropic\|openai" ~/ExoFrame/System/daemon.log
```

### Cleanup

```bash
# Stop daemon
exoctl daemon stop

# Unset API keys
unset ANTHROPIC_API_KEY
unset OPENAI_API_KEY
```

### Pass Criteria

- [ ] Real LLM responds successfully
- [ ] Plan is coherent and detailed
- [ ] Tokens counted correctly
- [ ] No API errors

---

## Scenario MT-12: Invalid Request Handling

**Purpose:** Verify system handles malformed input gracefully.

### Preconditions

- Daemon running

### Steps

```bash
# Step 1: Create request with invalid YAML
cat > ~/ExoFrame/Inbox/Requests/invalid-test.md << 'EOF'
---
id: broken
status: [invalid yaml
created: not-a-date
---

This request has broken frontmatter.
EOF

# Step 2: Wait for daemon to process
sleep 5

# Step 3: Check for error handling
exoctl request list
tail -20 ~/ExoFrame/System/daemon.log
```

### Expected Results

**Step 3:**

- Invalid request NOT in active list
- Error logged with clear message
- System continues operating (no crash)

### Verification

```bash
# Check error log
grep -i "validation error\|parse error\|invalid" ~/ExoFrame/System/daemon.log

# Verify daemon still healthy
exoctl daemon status
```

### Cleanup

```bash
# Remove invalid file
rm ~/ExoFrame/Inbox/Requests/invalid-test.md
```

### Pass Criteria

- [ ] Invalid file rejected gracefully
- [ ] Clear error message logged
- [ ] Daemon continues running
- [ ] Other requests unaffected

---

## Scenario MT-13: Database Corruption Recovery

**Purpose:** Verify system handles missing/corrupted database.

### Preconditions

- Daemon stopped
- Backup of current database (optional)

### Steps

```bash
# Step 1: Stop daemon if running
exoctl daemon stop 2>/dev/null || true

# Step 2: Backup current database
cp ~/ExoFrame/System/journal.db ~/ExoFrame/System/journal.db.backup

# Step 3: Corrupt/delete database
rm ~/ExoFrame/System/journal.db

# Step 4: Start daemon
cd ~/ExoFrame
exoctl daemon start
sleep 5

# Step 5: Check status
exoctl daemon status
```

### Expected Results

**Step 4:**

- Daemon starts (may show recovery messages)
- New database created
- OR shows clear error with recovery instructions

**Step 5:**

- Daemon functional or provides guidance

### Verification

```bash
# Check if database recreated
ls -la ~/ExoFrame/System/journal.db

# Check log for recovery messages
grep -i "database\|recovery\|init" ~/ExoFrame/System/daemon.log
```

### Cleanup

```bash
# Restore backup if needed
cp ~/ExoFrame/System/journal.db.backup ~/ExoFrame/System/journal.db
```

### Pass Criteria

- [ ] Clear error message if cannot recover
- [ ] Database recreated if possible
- [ ] Historical data loss noted in logs
- [ ] System operational after recovery

---

## Scenario MT-14: Concurrent Request Processing

**Purpose:** Verify system handles multiple simultaneous requests.

### Preconditions

- Daemon running

### Steps

```bash
# Step 1: Create multiple requests rapidly
for i in 1 2 3; do
  exoctl request "Test request number $i" &
done
wait

# Step 2: Wait for processing
sleep 10

# Step 3: List all requests
exoctl request list

# Step 4: Check for plans
exoctl plan list
```

### Expected Results

**Step 1:**

- All 3 requests created successfully

**Step 3:**

- All 3 requests appear in list
- Each has unique ID

**Step 4:**

- Plans generated for all requests
- No race condition errors

### Verification

```bash
# Check no duplicate IDs
exoctl request list | sort | uniq -d
# Should output nothing (no duplicates)

# Check logs for errors
grep -i "error\|conflict\|race" ~/ExoFrame/System/daemon.log
```

### Pass Criteria

- [ ] All requests processed
- [ ] No duplicate IDs
- [ ] No race condition errors
- [ ] Plans generated for each request

---

## Scenario MT-15: File Watcher Reliability

**Purpose:** Verify file watcher detects all changes reliably.

### Preconditions

- Daemon running

### Steps

```bash
# Step 1: Create files rapidly
for i in $(seq 1 5); do
  echo "Request $i" > ~/ExoFrame/Inbox/Requests/rapid-$i.md
  sleep 0.1
done

# Step 2: Modify files
for i in $(seq 1 5); do
  echo "Modified" >> ~/ExoFrame/Inbox/Requests/rapid-$i.md
  sleep 0.1
done

# Step 3: Wait for processing
sleep 5

# Step 4: Check detection
tail -50 ~/ExoFrame/System/daemon.log | grep -c "file\|detected\|changed"
```

### Expected Results

**Step 4:**

- All 10 file events detected (5 creates + 5 modifies)
- No missed events

### Verification

```bash
# Check daemon logs for file detection
tail -50 ~/ExoFrame/System/daemon.log | grep -c "file\|detected\|changed"
# Should show entries for file changes
```

### Cleanup

```bash
# Remove test files
rm ~/ExoFrame/Inbox/Requests/rapid-*.md
```

### Pass Criteria

- [ ] All file creates detected
- [ ] All file modifications detected
- [ ] No significant delays (< 500ms)

---

## Scenario MT-16: LLM Provider Selection

**Purpose:** Verify daemon correctly selects LLM provider based on environment variables and configuration.

### Preconditions

- ExoFrame installed (MT-01 complete)
- No daemon currently running
- Ollama installed (optional, for Ollama tests)

### Steps

```bash
# Step 1: Test default behavior (mock provider)
cd ~/ExoFrame
exoctl daemon start
sleep 3

# Step 2: Check startup logs for provider
grep -i "LLM Provider" ~/ExoFrame/System/daemon.log

# Step 3: Stop daemon
exoctl daemon stop

# Step 4: Test Ollama provider via environment
EXO_LLM_PROVIDER=ollama deno task start:fg &
sleep 3
grep -i "LLM Provider" ~/ExoFrame/System/daemon.log
exoctl daemon stop

# Step 5: Test Ollama with custom model
EXO_LLM_PROVIDER=ollama EXO_LLM_MODEL=codellama deno exoctl daemon start
sleep 3
grep -i "LLM Provider" ~/ExoFrame/System/daemon.log
exoctl daemon stop

# Step 6: Test missing API key error (Anthropic)
unset ANTHROPIC_API_KEY
EXO_LLM_PROVIDER=anthropic deno task start:fg 2>&1 | head -20
# Should show error about missing API key

# Step 7: Test config file provider selection
cat >> ~/ExoFrame/exo.config.toml << 'EOF'
[ai]
provider = "ollama"
model = "llama3.2"
EOF

exoctl daemon start
sleep 3
grep -i "LLM Provider" ~/ExoFrame/System/daemon.log
exoctl daemon stop

# Step 8: Test environment overrides config
EXO_LLM_PROVIDER=mock deno task start:fg &
sleep 3
grep -i "LLM Provider" ~/ExoFrame/System/daemon.log
exoctl daemon stop
```

### Expected Results

**Step 2:**

- Shows: `✅ LLM Provider: mock-recorded`
- Mock provider used by default

**Step 4:**

- Shows: `✅ LLM Provider: ollama-llama2`
- Ollama provider selected via env var

**Step 5:**

- Shows: `✅ LLM Provider: ollama-codellama`
- Custom model from EXO_LLM_MODEL

**Step 6:**

- Shows: `❌ Error: ANTHROPIC_API_KEY environment variable required for Anthropic provider`
- Daemon does NOT start

**Step 7:**

- Shows: `✅ LLM Provider: ollama-llama3.2`
- Config file settings used

**Step 8:**

- Shows: `✅ LLM Provider: mock-recorded`
- Environment variable overrides config

### Verification

```bash
# Check daemon log for provider initialization
grep -E "LLM Provider|provider.*mock|provider.*ollama" ~/ExoFrame/System/daemon.log

# Verify provider ID format
# Expected patterns:
#   mock-recorded
#   mock-scripted
#   ollama-<model>
#   anthropic-<model>
#   openai-<model>
```

### Cleanup

```bash
# Stop daemon
exoctl daemon stop 2>/dev/null || pkill -f "exoframe"

# Remove test config section (if added)
# Edit ~/ExoFrame/exo.config.toml and remove [ai] section

# Unset test environment variables
unset EXO_LLM_PROVIDER EXO_LLM_MODEL EXO_LLM_BASE_URL
```

### Pass Criteria

- [ ] Default provider is MockLLMProvider
- [ ] `EXO_LLM_PROVIDER=ollama` creates OllamaProvider
- [ ] `EXO_LLM_MODEL` overrides model name
- [ ] Missing API key shows clear error (does not crash)
- [ ] Config file `[ai]` section is respected
- [ ] Environment variables override config file
- [ ] Provider ID logged at startup

---

## QA Sign-off Template

```markdown
## Manual QA Sign-off: v[VERSION]

**Tester:** [Name]
**Date:** [Date]
**Platform:** [Ubuntu 24.04 / macOS / Windows WSL2]

### Test Results

| ID    | Scenario                 | Pass | Fail | Skip | Notes |
| ----- | ------------------------ | ---- | ---- | ---- | ----- |
| MT-01 | Fresh Installation       |      |      |      |       |
| MT-02 | Daemon Startup           |      |      |      |       |
| MT-03 | Blueprint Management     |      |      |      |       |
| MT-04 | Create Request           |      |      |      |       |
| MT-05 | Plan Generation (Mock)   |      |      |      |       |
| MT-06 | Plan Approval            |      |      |      |       |
| MT-07 | Plan Rejection           |      |      |      |       |
| MT-08 | Plan Execution (Mock)    |      |      |      |       |
| MT-09 | Portal Management        |      |      |      |       |
| MT-10 | Daemon Crash Recovery    |      |      |      |       |
| MT-11 | Real LLM Integration     |      |      |      |       |
| MT-12 | Invalid Request Handling |      |      |      |       |
| MT-13 | Database Corruption      |      |      |      |       |
| MT-14 | Concurrent Requests      |      |      |      |       |
| MT-15 | File Watcher Reliability |      |      |      |       |
| MT-16 | LLM Provider Selection   |      |      |      |       |

### Summary

- **Total Scenarios:** 16
- **Passed:**
- **Failed:**
- **Skipped:**

### Issues Found

1. [Issue description + steps to reproduce]
2. ...

### Verdict

- [ ] **APPROVED** for release
- [ ] **BLOCKED** - see issues above

**Signature:** _____________________
**Date:** _____________________
```

---

_End of Manual Test Scenarios_
