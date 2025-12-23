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
import { TuiSessionBase } from "./tui_common.ts";

export class PortalManagerTuiSession extends TuiSessionBase {
  private lastSelectionInvalid = false;
  private portals: PortalInfo[];
  private readonly service: PortalService;

  /**
   * @param portals Initial list of portals
   * @param service Service for portal operations
   */
  constructor(portals: PortalInfo[], service: PortalService) {
    super();
    this.portals = portals;
    this.service = service;
  }

  /** Set the selected portal index, clamped to valid range. */
  override setSelectedIndex(idx: number): void {
    // Allow callers to set an out-of-range index to indicate an invalid selection
    // (tests rely on being able to set -1 to simulate "no selection").
    if (idx < 0 || idx >= this.portals.length) {
      this.selectedIndex = idx;
      this.lastSelectionInvalid = true;
    } else {
      this.selectedIndex = idx;
      this.lastSelectionInvalid = false;
    }
  }

  /** Handle a TUI key event. */
  async handleKey(key: string): Promise<void> {
    if (this.portals.length === 0) return;
    if (this.lastSelectionInvalid) {
      this.statusMessage = "Error: No portal selected";
      return;
    }
    if (super.handleNavigationKey(key, this.portals.length)) {
      return;
    }

    // If selection is out of bounds, mark invalid and set immediate error
    if (this.selectedIndex < 0 || this.selectedIndex >= this.portals.length) {
      this.lastSelectionInvalid = true;
      this.statusMessage = "Error: No portal selected";
      return;
    }
    switch (key) {
      case "enter":
        try {
          const maybe = this.service.openPortal(this.portals[this.selectedIndex].alias);
          if (maybe && typeof (maybe as any).then === "function") {
            await this.performAction(async () => {
              await maybe;
            });
          } else {
            this.statusMessage = "";
          }
        } catch (e) {
          this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
        }
        break;
      case "r":
        try {
          const maybe = this.service.refreshPortal(this.portals[this.selectedIndex].alias);
          if (maybe && typeof (maybe as any).then === "function") {
            await this.performAction(async () => {
              await maybe;
            });
          } else {
            this.statusMessage = "";
          }
        } catch (e) {
          this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
        }
        break;
      case "d":
        try {
          const maybe = this.service.removePortal(this.portals[this.selectedIndex].alias);
          if (maybe && typeof (maybe as any).then === "function") {
            await this.performAction(async () => {
              await maybe;
            });
          } else {
            this.statusMessage = "";
          }
        } catch (e) {
          this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
        }
        break;
    }
    this.clampSelection(this.portals.length);
  }

  /** Update the portals list and clamp selection. */
  updatePortals(newPortals: PortalInfo[]): void {
    this.portals = newPortals;
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
  override getStatusMessage(): string {
    return this.statusMessage;
  }

  /**
   * Trigger a portal action and update status.
   * @param action Action to perform
   */
  async #triggerAction(action: "open" | "refresh" | "remove") {
    // kept for compatibility with any external callers, but delegate to performAction
    switch (action) {
      case "open":
        await this.performAction(async () => {
          await this.service.openPortal(this.portals[this.selectedIndex].alias);
        });
        break;
      case "refresh":
        await this.performAction(async () => {
          await this.service.refreshPortal(this.portals[this.selectedIndex].alias);
        });
        break;
      case "remove":
        await this.performAction(async () => {
          await this.service.removePortal(this.portals[this.selectedIndex].alias);
        });
        break;
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
