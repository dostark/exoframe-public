import { DatabaseService } from "../../src/services/db.ts";

export interface LogFilter {
  agent?: string;
  actionType?: string;
  traceId?: string;
  timeWindow?: number; // milliseconds
}

export interface LogEntry {
  id: string;
  trace_id: string;
  actor: string;
  agent_id: string | null;
  action_type: string;
  target: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class MonitorView {
  private db: DatabaseService;
  private filter: LogFilter = {};
  private isPaused = false;
  private logs: LogEntry[] = [];

  constructor(db: DatabaseService) {
    this.db = db;
    this.refreshLogs();
  }

  /**
   * Refresh logs from the database
   */
  refreshLogs(): void {
    if (!this.isPaused) {
      this.logs = this.db.getRecentActivity(1000);
    }
  }

  /**
   * Get all current logs
   */
  getLogs(): LogEntry[] {
    this.refreshLogs();
    return [...this.logs];
  }

  /**
   * Set filter for logs
   */
  setFilter(filter: LogFilter): void {
    this.filter = { ...filter };
  }

  /**
   * Get filtered logs based on current filter
   */
  getFilteredLogs(): LogEntry[] {
    let filtered = this.getLogs();

    if (this.filter.agent) {
      filtered = filtered.filter((log) => log.agent_id === this.filter.agent);
    }

    if (this.filter.actionType) {
      filtered = filtered.filter((log) => log.action_type === this.filter.actionType);
    }

    if (this.filter.traceId) {
      filtered = filtered.filter((log) => log.trace_id === this.filter.traceId);
    }

    if (this.filter.timeWindow) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - this.filter.timeWindow);
      filtered = filtered.filter((log) => new Date(log.timestamp) >= cutoff);
    }

    return filtered;
  }

  /**
   * Pause log streaming
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume log streaming
   */
  resume(): void {
    this.isPaused = false;
    this.refreshLogs();
  }

  /**
   * Check if streaming is active
   */
  isStreaming(): boolean {
    return !this.isPaused;
  }

  /**
   * Export logs to string format
   */
  exportLogs(): string {
    const logs = this.getFilteredLogs();
    return logs.map((log) => {
      return `${log.timestamp} [${log.actor}] ${log.action_type}: ${log.target || ""} ${JSON.stringify(log.payload)}`;
    }).join("\n");
  }

  /**
   * Get color for log level based on action type
   */
  getLogColor(actionType: string): string {
    switch (actionType) {
      case "request_created":
      case "request.created":
        return "green";
      case "plan_approved":
      case "plan.approved":
        return "blue";
      case "plan.rejected":
        return "red";
      case "execution_started":
      case "execution.started":
        return "yellow";
      case "execution_completed":
      case "execution.completed":
        return "green";
      case "execution_failed":
      case "execution.failed":
        return "red";
      case "error":
        return "red";
      default:
        return "white";
    }
  }

  /**
   * Render logs for TUI display
   */
  renderLogs(): string {
    const logs = this.getFilteredLogs();
    return logs.map((log) => {
      const color = this.getLogColor(log.action_type);
      return `\x1b[${this.getAnsiColorCode(color)}m${log.timestamp} [${log.actor}] ${log.action_type}: ${
        log.target || ""
      }\x1b[0m`;
    }).join("\n");
  }

  /**
   * Get ANSI color code
   */
  private getAnsiColorCode(color: string): number {
    switch (color) {
      case "red":
        return 31;
      case "green":
        return 32;
      case "yellow":
        return 33;
      case "blue":
        return 34;
      case "white":
      default:
        return 37;
    }
  }
}
