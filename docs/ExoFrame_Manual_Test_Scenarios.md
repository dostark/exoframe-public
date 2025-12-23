## Scenario MT-20: TUI Dashboard Launch and Core Views Navigation

**Purpose:** Verify `exoctl dashboard` launches successfully and all core views (Monitor, Plan Reviewer, Portal Manager, Daemon Control, Agent Status, Request Manager) are accessible and functional.

### Preconditions

- ExoFrame workspace deployed and initialized
- Daemon running (for full functionality)
- At least one request, plan, and portal exist in the system

### Steps

```bash
# Step 1: Launch the dashboard
exoctl dashboard

# Step 2: Verify initial view (Portal Manager) loads
# Step 3: Navigate to Monitor view (Tab key)
# Step 4: Navigate to Plan Reviewer view (Tab key)
# Step 5: Navigate to Daemon Control view (Tab key)
# Step 6: Navigate to Agent Status view (Tab key)
# Step 7: Navigate to Request Manager view (Tab key)
# Step 8: Return to Portal Manager view (Tab key)
# Step 9: Use Shift+Tab to navigate backwards through views
```

### Expected Results

- Dashboard launches without errors showing "ExoFrame TUI Dashboard"
- All 6 core views are accessible via Tab navigation
- Each view displays appropriate content and status information
- Navigation is smooth with clear visual feedback for active view
- Status bar shows "Ready" and navigation hints

### Verification

```bash
# Check that all views load without errors
# Verify view titles and content are displayed correctly
# Confirm Activity Journal shows dashboard launch event
sqlite3 ~/ExoFrame/System/journal.db "SELECT action_type, target FROM activity WHERE action_type LIKE '%dashboard%' ORDER BY timestamp DESC LIMIT 5;"
```

### Pass Criteria

- [ ] Dashboard launches successfully
- [ ] All 6 core views are accessible via Tab navigation
- [ ] Each view displays appropriate content
- [ ] No crashes or major UI glitches during navigation
- [ ] Status bar and navigation hints are visible

## Scenario MT-21: TUI Monitor View - Log Streaming and Filtering

**Purpose:** Verify the Monitor view provides real-time log streaming, filtering capabilities, and export functionality.

### Preconditions

- ExoFrame workspace with activity history
- Daemon running to generate logs
- Multiple agents and actions in the system

### Steps

```bash
# Step 1: Launch dashboard and navigate to Monitor view
exoctl dashboard
# Press Tab until Monitor view is active

# Step 2: Observe real-time log streaming
# Wait for new log entries to appear automatically

# Step 3: Test pause/resume functionality
# Press 'p' to pause streaming
# Press 'p' again to resume

# Step 4: Test filtering by agent
# Press 'f' then 'a' to filter by agent
# Select an agent from the list

# Step 5: Test filtering by action type
# Press 'f' then 't' to filter by action type
# Select an action type (e.g., "request.created")

# Step 6: Test time window filtering
# Press 'f' then 'w' to filter by time window
# Select a time window (e.g., "Last hour")

# Step 7: Test log export
# Press 'e' to export logs to file
# Verify file is created in workspace

# Step 8: Clear all filters
# Press 'c' to clear filters
```

### Expected Results

- Logs stream in real-time when not paused
- Pause/resume works correctly
- Filters apply correctly and show only matching logs
- Export creates a file with filtered logs
- Clear filters restores full log view
- Status bar shows current filter state

### Verification

```bash
# Check exported log file exists and contains expected content
ls -la ~/ExoFrame/logs_*.txt
cat ~/ExoFrame/logs_*.txt | head -10

# Verify filter state in Activity Journal
sqlite3 ~/ExoFrame/System/journal.db "SELECT * FROM activity WHERE action_type LIKE '%filter%' ORDER BY timestamp DESC LIMIT 5;"
```

### Pass Criteria

- [ ] Real-time log streaming works
- [ ] Pause/resume functionality works
- [ ] All filter types (agent, action, time) work correctly
- [ ] Log export creates valid file
- [ ] Filter clearing restores full view
- [ ] No performance issues with large log volumes

## Scenario MT-22: TUI Plan Reviewer View - Plan Management

**Purpose:** Verify the Plan Reviewer view allows browsing, reviewing, and approving/rejecting plans with proper keyboard navigation.

### Preconditions

- At least 2-3 pending plans exist in the system
- Plans have different statuses and content

### Steps

```bash
# Step 1: Launch dashboard and navigate to Plan Reviewer view
exoctl dashboard
# Press Tab until Plan Reviewer view is active

# Step 2: Navigate through plans
# Use Down/Up arrows to browse plans
# Use Home/End to jump to first/last plan

# Step 3: View plan details
# Press Enter on a plan to view its diff/content

# Step 4: Approve a plan
# Select a pending plan
# Press 'a' to approve
# Confirm approval in dialog

# Step 5: Reject a plan
# Select another pending plan
# Press 'r' to reject
# Enter rejection reason in dialog

# Step 6: Verify plan status changes
# Check that approved plan disappears from list
# Check that rejected plan disappears from list
```

### Expected Results

- Plans are listed with clear status indicators
- Keyboard navigation works smoothly
- Plan details/diff view shows correctly
- Approval moves plan to approved status
- Rejection moves plan to rejected status with reason
- Status messages show success/error feedback

### Verification

```bash
# Check Activity Journal for approval/rejection events
sqlite3 ~/ExoFrame/System/journal.db "SELECT action_type, target, payload FROM activity WHERE action_type LIKE '%plan%' ORDER BY timestamp DESC LIMIT 5;"

# Verify plans moved to correct directories
ls ~/ExoFrame/Inbox/Plans/  # Should not contain approved/rejected plans
ls ~/ExoFrame/Inbox/Approved/  # Should contain approved plans
ls ~/ExoFrame/Inbox/Rejected/  # Should contain rejected plans
```

### Pass Criteria

- [ ] Plans display correctly with navigation
- [ ] Plan details/diff view works
- [ ] Approval action succeeds and moves plan
- [ ] Rejection action succeeds with reason
- [ ] Status feedback is clear
- [ ] Activity Journal logs all actions

## Scenario MT-23: TUI Portal Manager View - Portal Management

**Purpose:** Verify the Portal Manager view allows managing portals (open, close, refresh, create, edit, remove, sync) with proper keyboard navigation.

### Preconditions

- At least 2-3 active portals exist in the system
- Portals have different statuses and targets

### Steps

```bash
# Step 1: Launch dashboard and navigate to Portal Manager view
exoctl dashboard
# Verify Portal Manager view is active

# Step 2: Navigate through portals
# Use Down/Up arrows to browse portals
# Use Home/End to jump to first/last portal

# Step 3: Perform portal actions
# Select a portal and press 'o' to open
# Press 'r' to refresh
# Press 'd' to delete
# Press 'e' to edit portal details
# Press 's' to sync portal

# Step 4: Create a new portal
# Press 'c' to create a new portal
# Enter portal details as prompted
```

### Expected Results

- All portal actions (open, refresh, delete, edit, sync) work correctly
- New portal creation prompts for details and adds the portal to the list
- Navigation is smooth with clear visual feedback for active portal
- Status bar shows current portal action state

### Verification

```bash
# Verify portal actions in Activity Journal
sqlite3 ~/ExoFrame/System/journal.db "SELECT * FROM activity WHERE action_type LIKE '%portal%' ORDER BY timestamp DESC LIMIT 5;"
```

### Pass Criteria

- [ ] All portal actions work as expected
- [ ] New portal creation is successful
- [ ] No crashes or major UI glitches during portal management

---

## Scenario MT-24: TUI Daemon Control View - Daemon Management

**Purpose:** Verify the Daemon Control view allows managing the daemon (start, stop, restart) and viewing logs.

### Preconditions

- Daemon is installed and configured
- Daemon is running or stopped

### Steps

```bash
# Step 1: Launch dashboard and navigate to Daemon Control view
exoctl dashboard
# Press Tab until Daemon Control view is active

# Step 2: View daemon status
# Verify daemon status, uptime, and recent errors are displayed

# Step 3: Perform daemon actions
# Press 's' to stop the daemon
# Press 'r' to restart the daemon
# Press 'l' to view daemon logs
```

### Expected Results

- Daemon status, uptime, and errors are displayed correctly
- Stop, restart, and log viewing actions work as expected
- Status bar shows current daemon state

### Verification

```bash
# Verify daemon actions in Activity Journal
sqlite3 ~/ExoFrame/System/journal.db "SELECT * FROM activity WHERE action_type LIKE '%daemon%' ORDER BY timestamp DESC LIMIT 5;"
```

### Pass Criteria

- [ ] Daemon status and logs are displayed correctly
- [ ] Stop and restart actions work as expected
- [ ] No crashes or major UI glitches during daemon management

---

## Scenario MT-25: TUI Request Manager View - Request Management

**Purpose:** Verify the Request Manager view allows managing requests (create, view, cancel) with proper keyboard navigation.

### Preconditions

- At least 2-3 requests exist in the system
- Requests have different statuses and details

### Steps

```bash
# Step 1: Launch dashboard and navigate to Request Manager view
exoctl dashboard
# Press Tab until Request Manager view is active

# Step 2: Navigate through requests
# Use Down/Up arrows to browse requests
# Use Home/End to jump to first/last request

# Step 3: Perform request actions
# Select a request and press 'v' to view details
# Press 'c' to cancel the request

# Step 4: Create a new request
# Press 'n' to create a new request
# Enter request details as prompted
```

### Expected Results

- All request actions (view, cancel) work correctly
- New request creation prompts for details and adds the request to the list
- Navigation is smooth with clear visual feedback for active request
- Status bar shows current request action state

### Verification

```bash
# Verify request actions in Activity Journal
sqlite3 ~/ExoFrame/System/journal.db "SELECT * FROM activity WHERE action_type LIKE '%request%' ORDER BY timestamp DESC LIMIT 5;"
```

### Pass Criteria

- [ ] All request actions work as expected
- [ ] New request creation is successful
- [ ] No crashes or major UI glitches during request management

```
```
