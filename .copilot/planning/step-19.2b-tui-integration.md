# Step 19.2b TUI Integration: SQLite-Based Notifications

**Date:** 2026-01-06
**Status:** PLANNED
**Parent:** Phase 19: Folder Structure Restructuring
**Related:** Phase 13: TUI Enhancement & Unification

---

## Overview

This document outlines the changes needed to integrate the new SQLite-based notification system (Step 19.2b) into the TUI Dashboard. The TUI currently uses an in-memory notification system that needs to be replaced with database-backed notifications.

## Current TUI Notification Architecture

### Current Implementation

**Location:** `src/tui/tui_dashboard.ts`

**Current Notification Interface:**
```typescript
export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: Date;
  dismissed: boolean;
  autoExpire: boolean;
  duration: number; // milliseconds
}
```

**Current State:**
```typescript
export interface DashboardViewState {
  showNotifications: boolean;
  notifications: Notification[];  // In-memory array
  // ... other fields
}
```

**Current Behavior:**
- Notifications stored in memory (`state.notifications[]`)
- Created via `createNotification()` helper
- Auto-expire after duration (5 seconds default)
- Rendered via `renderNotificationPanel()`
- Toggled with `n` key
- Dismissed manually or auto-expire

### Current Usage Patterns

1. **Dashboard Notifications:**
   - Pane split/close actions
   - Layout save/restore
   - View switching

2. **Notification Display:**
   - Panel shown with `n` key
   - Badge in status bar: `🔔${count}`
   - Most recent shown first
   - Auto-dismiss after 5 seconds

## Proposed Changes

### 1. Update Notification Interface

**Align with SQLite Schema:**

```typescript
// src/tui/tui_dashboard.ts

export interface TuiNotification {
  id?: string;                    // UUID from database
  type: "memory_update_pending" | "memory_approved" | "memory_rejected" | "info" | "success" | "warning" | "error";
  message: string;
  proposal_id?: string;           // For memory update notifications
  trace_id?: string;              // Link to activity
  created_at?: string;            // ISO timestamp
  dismissed_at?: string | null;   // Soft-delete timestamp
  metadata?: string;              // JSON metadata
}
```

### 2. Add NotificationService Dependency

**Inject NotificationService into Dashboard:**

```typescript
// src/tui/tui_dashboard.ts

export async function launchTuiDashboard(
  options: {
    testMode?: boolean;
    nonInteractive?: boolean;
    notificationService?: NotificationService;  // NEW
    config?: Config;                            // NEW
    db?: DatabaseService;                       // NEW
  } = {},
): Promise<TuiDashboard | undefined> {
  // Initialize services
  const config = options.config || await loadConfig();
  const db = options.db || new DatabaseService(config);
  const notificationService = options.notificationService || new NotificationService(config, db);

  // ...
}
```

### 3. Replace In-Memory Notifications with Database Queries

**Remove In-Memory Array:**

```typescript
// BEFORE:
export interface DashboardViewState {
  notifications: Notification[];  // ❌ Remove
}

// AFTER:
export interface DashboardViewState {
  showNotifications: boolean;
  // notifications removed - query from DB on demand
}
```

**Query Notifications from Database:**

```typescript
// src/tui/tui_dashboard.ts

export class TuiDashboardImpl implements TuiDashboard {
  constructor(
    private notificationService: NotificationService,
    // ... other dependencies
  ) {}

  async getActiveNotifications(): Promise<TuiNotification[]> {
    // Query from database instead of in-memory array
    return await this.notificationService.getNotifications();
  }

  async getNotificationCount(): Promise<number> {
    return await this.notificationService.getPendingCount();
  }

  async dismissNotification(proposalId: string): Promise<void> {
    await this.notificationService.clearNotification(proposalId);
  }

  async clearAllNotifications(): Promise<void> {
    await this.notificationService.clearAllNotifications();
  }
}
```

### 4. Update Notification Rendering

**Async Rendering:**

```typescript
// src/tui/tui_dashboard.ts

export async function renderNotificationPanel(
  notificationService: NotificationService,
  theme: Theme,
  maxHeight = 10,
): Promise<string[]> {
  const lines: string[] = [];

  // Query active notifications from database
  const activeNotifications = await notificationService.getNotifications();

  if (activeNotifications.length === 0) {
    lines.push(colorize("  No notifications", theme.textDim, theme.reset));
    return lines;
  }

  // Header
  lines.push(
    colorize(
      `${DASHBOARD_ICONS.notification.bell} Notifications (${activeNotifications.length})`,
      theme.h2,
      theme.reset,
    ),
  );
  lines.push("");

  // Show most recent notifications
  const visibleNotifications = activeNotifications.slice(0, maxHeight - 2);

  for (const notification of visibleNotifications) {
    const icon = getNotificationIcon(notification.type);
    const timeAgo = formatTimeAgo(new Date(notification.created_at!));

    let messageColor = theme.text;
    if (notification.type === "error" || notification.type === "memory_rejected") {
      messageColor = theme.error;
    } else if (notification.type === "warning") {
      messageColor = theme.warning;
    } else if (notification.type === "success" || notification.type === "memory_approved") {
      messageColor = theme.success;
    } else if (notification.type === "info" || notification.type === "memory_update_pending") {
      messageColor = theme.primary;
    }

    const line = `  ${icon} ${colorize(notification.message, messageColor, theme.reset)} ${
      colorize(`(${timeAgo})`, theme.textDim, theme.reset)
    }`;
    lines.push(line);
  }

  if (activeNotifications.length > visibleNotifications.length) {
    const more = activeNotifications.length - visibleNotifications.length;
    lines.push(colorize(`  ... and ${more} more`, theme.textDim, theme.reset));
  }

  return lines;
}

function getNotificationIcon(type: string): string {
  const iconMap: Record<string, string> = {
    "info": DASHBOARD_ICONS.notification.info,
    "success": DASHBOARD_ICONS.notification.success,
    "warning": DASHBOARD_ICONS.notification.warning,
    "error": DASHBOARD_ICONS.notification.error,
    "memory_update_pending": "📝",
    "memory_approved": "✅",
    "memory_rejected": "❌",
  };
  return iconMap[type] || DASHBOARD_ICONS.notification.info;
}
```

### 5. Update Status Bar Badge

**Async Badge Count:**

```typescript
// src/tui/tui_dashboard.ts

async renderStatusBar(): Promise<string> {
  const activePane = this.panes.find((p) => p.id === this.activePaneId);
  const indicator = renderViewIndicator(this.panes, this.activePaneId, this.theme);

  // Query notification count from database
  const notificationCount = await this.notificationService.getPendingCount();
  const notificationBadge = notificationCount > 0 ? ` 🔔${notificationCount}` : "";

  return `${indicator} │ Active: ${activePane?.view.name}${notificationBadge}`;
}
```

### 6. Add Memory Update Notification Handling

**New Keyboard Shortcut for Memory Notifications:**

```typescript
// src/tui/tui_dashboard.ts

// Add to DASHBOARD_KEY_BINDINGS
{ key: "m", action: "show_memory_notifications", description: "Memory updates", category: "General" },
```

**Memory Notification Actions:**

```typescript
// Handle memory update notifications
if (key === "m") {
  // Show only memory update notifications
  this.state.showMemoryNotifications = true;
} else if (this.state.showMemoryNotifications) {
  if (key === "escape" || key === "esc") {
    this.state.showMemoryNotifications = false;
  } else if (key === "a") {
    // Approve selected memory update
    const notifications = await this.notificationService.getNotifications();
    const memoryNotifs = notifications.filter(n => n.type === "memory_update_pending");
    if (memoryNotifs.length > 0) {
      const selected = memoryNotifs[this.selectedMemoryNotifIndex];
      // Trigger approval workflow
      await this.approveMemoryUpdate(selected.proposal_id!);
      await this.notificationService.clearNotification(selected.proposal_id!);
    }
  } else if (key === "r") {
    // Reject selected memory update
    const notifications = await this.notificationService.getNotifications();
    const memoryNotifs = notifications.filter(n => n.type === "memory_update_pending");
    if (memoryNotifs.length > 0) {
      const selected = memoryNotifs[this.selectedMemoryNotifIndex];
      // Trigger rejection workflow
      await this.rejectMemoryUpdate(selected.proposal_id!);
      await this.notificationService.clearNotification(selected.proposal_id!);
    }
  }
}
```

### 7. Update Dashboard Tests

**Mock NotificationService:**

```typescript
// tests/tui/tui_dashboard_test.ts

class MockNotificationService {
  private notifications: MemoryNotification[] = [];

  async getNotifications(): Promise<MemoryNotification[]> {
    return this.notifications.filter(n => !n.dismissed_at);
  }

  async getPendingCount(): Promise<number> {
    return this.notifications.filter(n =>
      n.type === "memory_update_pending" && !n.dismissed_at
    ).length;
  }

  async clearNotification(proposalId: string): Promise<void> {
    const notif = this.notifications.find(n => n.proposal_id === proposalId);
    if (notif) {
      notif.dismissed_at = new Date().toISOString();
    }
  }

  async clearAllNotifications(): Promise<void> {
    this.notifications.forEach(n => {
      n.dismissed_at = new Date().toISOString();
    });
  }

  // Test helper
  addTestNotification(notification: MemoryNotification): void {
    this.notifications.push(notification);
  }
}
```

**Update Tests:**

```typescript
Deno.test("TUI Dashboard: queries notifications from database", async () => {
  const mockNotifService = new MockNotificationService();
  mockNotifService.addTestNotification({
    id: "test-1",
    type: "memory_update_pending",
    message: "Test notification",
    proposal_id: "proposal-1",
    created_at: new Date().toISOString(),
  });

  const dashboard = await launchTuiDashboard({
    testMode: true,
    notificationService: mockNotifService,
  });

  const count = await dashboard.getNotificationCount();
  assertEquals(count, 1);
});

Deno.test("TUI Dashboard: dismisses notification via database", async () => {
  const mockNotifService = new MockNotificationService();
  mockNotifService.addTestNotification({
    id: "test-1",
    type: "memory_update_pending",
    message: "Test notification",
    proposal_id: "proposal-1",
    created_at: new Date().toISOString(),
  });

  const dashboard = await launchTuiDashboard({
    testMode: true,
    notificationService: mockNotifService,
  });

  await dashboard.dismissNotification("proposal-1");

  const count = await dashboard.getNotificationCount();
  assertEquals(count, 0);
});
```

## Implementation Checklist

### Phase 1: Core Integration
- [x] Update `Notification` interface to match SQLite schema
- [x] Add `NotificationService` dependency to `launchTuiDashboard()`
- [x] Remove in-memory `notifications` array from state
- [x] Update `renderNotificationPanel()` to query from database
- [x] Update status bar badge to query count from database
- [x] Add async rendering support

### Phase 2: Memory Update Notifications
- [x] Add memory notification icon mapping
- [x] Add `m` keyboard shortcut for memory notifications
- [x] Implement memory notification approval/rejection workflow
- [x] Add memory notification detail view

### Phase 3: Testing
- [x] Create `MockNotificationService` for tests
- [x] Update existing dashboard tests
- [x] Add tests for database-backed notifications
- [x] Add tests for memory update notification handling

### Phase 4: Documentation
- [x] Update TUI keyboard reference
- [ ] Update help screen with memory notification shortcuts
- [ ] Document notification persistence behavior

## Benefits

| Benefit | Impact |
|---------|--------|
| **Persistent Notifications** | Notifications survive TUI restarts |
| **Consistent Data** | Single source of truth (database) |
| **Better Performance** | No in-memory array management |
| **Audit Trail** | All notifications logged to Activity Journal |
| **Memory Integration** | Direct link to memory update proposals |

## Backward Compatibility

**Breaking Changes:**
- `Notification` interface updated (type field expanded)
- `notify()` method signature may change
- Auto-expire behavior removed (database-backed)

**Migration Path:**
- Existing in-memory notifications will be lost on restart (acceptable)
- New notifications will be database-backed
- Tests updated to use mock service

## Success Criteria

- [x] TUI queries notifications from database
- [x] Notification badge shows correct count from database
- [x] Notifications persist across TUI restarts
- [x] Memory update notifications displayed correctly
- [x] All existing TUI tests pass
- [x] New notification tests added and passing

## Timeline

**Estimated Effort:** 0.5 day

1. Core Integration: 2 hours
2. Memory Update Handling: 1 hour
3. Testing: 1 hour
4. Documentation: 30 minutes

---

**Next Steps:**
1. Completed all planned integration phases.
2. Final review and documentation update.
