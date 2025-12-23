// ...existing code...
import { PortalDetails, PortalInfo } from "../cli/portal_commands.ts";

// --- Service interface for Portal Manager ---
/**
 * Service interface for Portal Manager business logic.
 */
export interface PortalService {
  listPortals(): Promise<PortalInfo[]>;
  getPortalDetails(alias: string): Promise<PortalDetails>;
  openPortal(alias: string): Promise<boolean>;
  closePortal(alias: string): Promise<boolean>;
  refreshPortal(alias: string): Promise<boolean>;
  removePortal(alias: string, options?: { keepCard?: boolean }): Promise<boolean>;
  quickJumpToPortalDir(alias: string): Promise<string>;
  getPortalFilesystemPath(alias: string): Promise<string>;
  getPortalActivityLog(alias: string): string[];
}

// --- TUI Session for Portal Manager ---
/**
 * TUI session for Portal Manager. Encapsulates state and user interaction logic.
 */
export class PortalManagerTuiSession {
  private selectedIndex = 0;
  private statusMessage = "";
  private lastSelectionInvalid = false;
  /**
   * @param portals Initial list of portals
   * @param service Service for portal operations
   */
  constructor(private readonly portals: PortalInfo[], private readonly service: PortalService) {}

  /** Get the currently selected portal index. */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /** Set the selected portal index, clamped to valid range. */
  setSelectedIndex(idx: number): void {
    if (idx < 0 || idx >= this.portals.length) {
      this.selectedIndex = 0;
      this.lastSelectionInvalid = true;
    } else {
      this.selectedIndex = idx;
      this.lastSelectionInvalid = false;
    }
  }

  /** Handle a TUI key event. */
  handleKey(key: string): void {
    if (this.portals.length === 0) return;
    switch (key) {
      case "down":
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.portals.length - 1);
        break;
      case "up":
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        break;
      case "end":
        this.selectedIndex = this.portals.length - 1;
        break;
      case "home":
        this.selectedIndex = 0;
        break;
      case "enter":
        this.#triggerAction("open");
        break;
      case "r":
        this.#triggerAction("refresh");
        break;
      case "d":
        this.#triggerAction("remove");
        break;
    }
    if (this.selectedIndex >= this.portals.length) {
      this.selectedIndex = Math.max(0, this.portals.length - 1);
    }
  }

  /** Update the portals list and clamp selection. */
  updatePortals(newPortals: PortalInfo[]): void {
    (this as any).portals = newPortals;
    if (this.selectedIndex >= newPortals.length) {
      this.selectedIndex = Math.max(0, newPortals.length - 1);
    }
  }

  /** Get details for the currently selected portal. */
  getSelectedPortalDetails(): PortalInfo | undefined {
    if (this.portals.length === 0) return undefined;
    return this.portals[this.selectedIndex];
  }

  /** Render action buttons for the selected portal. */
  renderActionButtons(): string {
    if (!this.portals.length) return "";
    return `[Enter] Open   [r] Refresh   [d] Remove`;
  }

  /** Render a status bar for errors or state changes. */
  renderStatusBar(): string {
    return this.statusMessage ? `Status: ${this.statusMessage}` : "Ready";
  }

  /** Accessibility: Return focusable elements for testability. */
  getFocusableElements(): string[] {
    return ["portal-list", "action-buttons", "status-bar"];
  }

  /** Get the current status message. */
  getStatusMessage(): string {
    return this.statusMessage;
  }

  /**
   * Trigger a portal action and update status.
   * @param action Action to perform
   */
  async #triggerAction(action: "open" | "refresh" | "remove") {
    if (this.lastSelectionInvalid) {
      this.statusMessage = `Error: No portal selected`;
      this.lastSelectionInvalid = false;
      return;
    }
    const portal = this.portals[this.selectedIndex];
    if (!portal) {
      this.statusMessage = `Error: No portal selected`;
      return;
    }
    try {
      switch (action) {
        case "open":
          await this.service.openPortal(portal.alias);
          break;
        case "refresh":
          await this.service.refreshPortal(portal.alias);
          break;
        case "remove":
          await this.service.removePortal(portal.alias);
          break;
      }
      this.statusMessage = "";
    } catch (e) {
      if (e && typeof e === "object" && "message" in e) {
        this.statusMessage = `Error: ${(e as Error).message}`;
      } else {
        this.statusMessage = `Error: ${String(e)}`;
      }
    }
  }
}

/**
 * View/controller for Portal Manager. Delegates to injected PortalService.
 */
export class PortalManagerView implements PortalService {
  constructor(public readonly service: PortalService) {}

  /** Create a new TUI session for the given portals. */
  createTuiSession(portals: PortalInfo[]): PortalManagerTuiSession {
    return new PortalManagerTuiSession(portals, this.service);
  }

  listPortals(): Promise<PortalInfo[]> {
    return this.service.listPortals();
  }
  getPortalDetails(alias: string): Promise<PortalDetails> {
    return this.service.getPortalDetails(alias);
  }
  openPortal(alias: string): Promise<boolean> {
    return this.service.openPortal(alias);
  }
  closePortal(alias: string): Promise<boolean> {
    return this.service.closePortal(alias);
  }
  refreshPortal(alias: string): Promise<boolean> {
    return this.service.refreshPortal(alias);
  }
  removePortal(alias: string, options?: { keepCard?: boolean }): Promise<boolean> {
    return this.service.removePortal(alias, options);
  }
  quickJumpToPortalDir(alias: string): Promise<string> {
    return this.service.quickJumpToPortalDir(alias);
  }
  getPortalFilesystemPath(alias: string): Promise<string> {
    return this.service.getPortalFilesystemPath(alias);
  }
  getPortalActivityLog(alias: string): string[] {
    return this.service.getPortalActivityLog(alias);
  }

  /** Render a list of portals for display. */
  renderPortalList(portals: PortalInfo[]): string {
    return portals.map((p) => {
      let line = `${p.alias} [${p.status}] (${p.targetPath})`;
      if (p.status && p.status !== "active") {
        line += `  ⚠️ ERROR: ${p.status}`;
      }
      return line;
    }).join("\n");
  }
}
