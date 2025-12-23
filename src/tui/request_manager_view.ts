// --- Service interface for Request management ---
export interface RequestService {
  listRequests(status?: string): Promise<Request[]>;
  getRequestContent(requestId: string): Promise<string>;
  createRequest(description: string, options?: RequestOptions): Promise<Request>;
  updateRequestStatus(requestId: string, status: string): Promise<boolean>;
}

// --- Request data types ---
export interface Request {
  trace_id: string;
  filename: string;
  title: string;
  status: string;
  priority: string;
  agent: string;
  portal?: string;
  model?: string;
  created: string;
  created_by: string;
  source: string;
}

export interface RequestOptions {
  agent?: string;
  priority?: "low" | "normal" | "high" | "critical";
  portal?: string;
  model?: string;
}

// --- Adapter: RequestCommands as RequestService ---
import type { RequestCommands } from "../cli/request_commands.ts";

/**
 * Adapter: RequestCommands as RequestService
 */
export class RequestCommandsServiceAdapter implements RequestService {
  constructor(private readonly cmd: RequestCommands) {}

  async listRequests(status?: string): Promise<Request[]> {
    const requests = await this.cmd.list(status);
    return requests.map((r) => ({
      trace_id: r.trace_id,
      filename: r.filename,
      title: `Request ${r.trace_id.slice(0, 8)}`,
      status: r.status,
      priority: r.priority,
      agent: r.agent,
      portal: r.portal,
      model: r.model,
      created: r.created,
      created_by: r.created_by,
      source: r.source,
    }));
  }

  async getRequestContent(requestId: string): Promise<string> {
    const result = await this.cmd.show(requestId);
    return result.content;
  }

  async createRequest(description: string, options?: RequestOptions): Promise<Request> {
    const metadata = await this.cmd.create(description, options);
    return {
      trace_id: metadata.trace_id,
      filename: metadata.filename,
      title: `Request ${metadata.trace_id.slice(0, 8)}`,
      status: metadata.status,
      priority: metadata.priority,
      agent: metadata.agent,
      portal: metadata.portal,
      model: metadata.model,
      created: metadata.created,
      created_by: metadata.created_by,
      source: metadata.source,
    };
  }

  updateRequestStatus(requestId: string, status: string): Promise<boolean> {
    // RequestCommands doesn't have update status method, so we'll need to implement this
    // For now, return true as a placeholder
    console.warn(`updateRequestStatus not implemented for ${requestId} -> ${status}`);
    return Promise.resolve(true);
  }
}

// --- Minimal RequestService mock for TUI session tests ---
/**
 * Minimal RequestService mock for TUI session tests.
 */
export class MinimalRequestServiceMock implements RequestService {
  listRequests = (_status?: string) => Promise.resolve([]);
  getRequestContent = (_: string) => Promise.resolve("");
  createRequest = (_: string, __?: RequestOptions) => Promise.resolve({} as Request);
  updateRequestStatus = (_: string, __: string) => Promise.resolve(true);
}

// --- TUI Session for Request Manager ---
/**
 * TUI session for Request Manager. Encapsulates state and user interaction logic.
 */
export class RequestManagerTuiSession {
  private selectedIndex = 0;
  private statusMessage = "";

  /**
   * @param requests Initial list of requests
   * @param service Service for request operations
   */
  constructor(private readonly requests: Request[], private readonly service: RequestService) {}

  /** Get the currently selected request index. */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /** Set the selected request index, clamped to valid range. */
  setSelectedIndex(idx: number): void {
    if (idx < 0 || idx >= this.requests.length) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = idx;
    }
  }

  /** Handle a TUI key event. */
  async handleKey(key: string): Promise<void> {
    if (this.requests.length === 0) return;

    switch (key) {
      case "down":
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.requests.length - 1);
        break;
      case "up":
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        break;
      case "end":
        this.selectedIndex = this.requests.length - 1;
        break;
      case "home":
        this.selectedIndex = 0;
        break;
      case "c":
        await this.#triggerAction("create");
        break;
      case "v":
        await this.#triggerAction("view");
        break;
      case "d":
        await this.#triggerAction("delete");
        break;
    }

    if (this.selectedIndex >= this.requests.length) {
      this.selectedIndex = Math.max(0, this.requests.length - 1);
    }
  }

  /**
   * Trigger a request action and update status.
   * @param action Action to perform
   */
  async #triggerAction(action: "create" | "view" | "delete") {
    try {
      switch (action) {
        case "create": {
          const newRequest = await this.service.createRequest("New request from TUI", { priority: "normal" });
          this.statusMessage = `Created request: ${newRequest.trace_id.slice(0, 8)}`;
          break;
        }
        case "view": {
          const request = this.requests[this.selectedIndex];
          if (request) {
            const _content = await this.service.getRequestContent(request.trace_id);
            this.statusMessage = `Viewing: ${request.trace_id.slice(0, 8)}`;
            // In a real implementation, this would open a detail view
          }
          break;
        }
        case "delete": {
          const delRequest = this.requests[this.selectedIndex];
          if (delRequest) {
            await this.service.updateRequestStatus(delRequest.trace_id, "cancelled");
            this.statusMessage = `Cancelled request: ${delRequest.trace_id.slice(0, 8)}`;
          }
          break;
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "message" in e) {
        this.statusMessage = `Error: ${(e as Error).message}`;
      } else {
        this.statusMessage = `Error: ${String(e)}`;
      }
    }
  }

  /** Get the current status message. */
  getStatusMessage(): string {
    return this.statusMessage;
  }

  /** Get the currently selected request. */
  getSelectedRequest(): Request | null {
    return this.requests[this.selectedIndex] || null;
  }
}

/**
 * View/controller for Request Manager. Delegates to injected RequestService.
 */
export class RequestManagerView implements RequestService {
  constructor(public readonly service: RequestService) {}

  /** Create a new TUI session for the given requests. */
  createTuiSession(requests: Request[]): RequestManagerTuiSession {
    return new RequestManagerTuiSession(requests, this.service);
  }

  listRequests(status?: string): Promise<Request[]> {
    return this.service.listRequests(status);
  }

  getRequestContent(requestId: string): Promise<string> {
    return this.service.getRequestContent(requestId);
  }

  createRequest(description: string, options?: RequestOptions): Promise<Request> {
    return this.service.createRequest(description, options);
  }

  updateRequestStatus(requestId: string, status: string): Promise<boolean> {
    return this.service.updateRequestStatus(requestId, status);
  }

  /** Render a list of requests for display. */
  renderRequestList(requests: Request[]): string {
    if (requests.length === 0) {
      return "No requests found.";
    }

    const lines = ["Requests:", ""];
    for (const request of requests) {
      const priorityIcon = request.priority === "critical"
        ? "🔴"
        : request.priority === "high"
        ? "🟠"
        : request.priority === "low"
        ? "🔵"
        : "⚪";
      const statusIcon = request.status === "pending"
        ? "⏳"
        : request.status === "planned"
        ? "📋"
        : request.status === "completed"
        ? "✅"
        : request.status === "cancelled"
        ? "❌"
        : "❓";

      lines.push(
        `${statusIcon} ${priorityIcon} ${request.title} - ${request.agent} - ${
          new Date(request.created).toLocaleString()
        }`,
      );
    }
    return lines.join("\n");
  }

  /** Render request content for display. */
  renderRequestContent(content: string): string {
    return content;
  }
}
