// ...existing code...
import { PortalCommands, PortalDetails, PortalInfo } from "../cli/portal_commands.ts";

// --- TUI Session Mock for TDD ---
// This is a minimal stub to allow TDD tests to fail. Real logic will be implemented after tests are red.

export class PortalManagerTuiSession {
  private selectedIndex = 0;
  private statusMessage = "";
  private lastSelectionInvalid = false;
  constructor(private portals: any[], private service: any) {}

  getSelectedIndex() {
    return this.selectedIndex;
  }

  setSelectedIndex(idx: number) {
    if (idx < 0 || idx >= this.portals.length) {
      this.selectedIndex = 0;
      this.lastSelectionInvalid = true;
    } else {
      this.selectedIndex = idx;
      this.lastSelectionInvalid = false;
    }
  }

  handleKey(key: string) {
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
    // Clamp selection if portals list shrinks, but only after action
    if (this.selectedIndex >= this.portals.length) {
      this.selectedIndex = Math.max(0, this.portals.length - 1);
    }
  }

  #triggerAction(action: "open" | "refresh" | "remove") {
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
          this.service.openPortal(portal.alias);
          break;
        case "refresh":
          this.service.refreshPortal(portal.alias);
          break;
        case "remove":
          this.service.removePortal(portal.alias);
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

  getStatusMessage() {
    return this.statusMessage;
  }
}

export class PortalManagerView {
  service: any;
  constructor(service?: any) {
    this.service = service;
  }
  // TDD: Expose a TUI session interface for tests
  createTuiSession() {
    return new PortalManagerTuiSession(this.service?.portals || [], this.service);
  }

  private isPortalCommands(obj: any): obj is PortalCommands {
    return obj && typeof obj.list === "function" && typeof obj.show === "function";
  }

  // Support both CLI PortalCommands and test/mock services
  private isDbLike(obj: any): boolean {
    return obj && typeof obj.listPortals === "function";
  }

  private ensurePortalCommands(): PortalCommands {
    if (this.isPortalCommands(this.service)) return this.service;
    if ((globalThis as any).CLIContext && (globalThis as any).WORKSPACE_ROOT) {
      return new PortalCommands((globalThis as any).CLIContext);
    }
    throw new Error("PortalCommands instance not provided and global CLI context missing");
  }

  async listPortals(): Promise<PortalInfo[]> {
    if (this.isDbLike(this.service)) {
      return await this.service.listPortals();
    }
    const cmd = this.ensurePortalCommands();
    return await cmd.list();
  }

  async getPortalDetails(alias: string): Promise<PortalDetails> {
    if (this.isDbLike(this.service)) {
      // For tests, just find the portal in the mock list
      const portals = await this.service.listPortals();
      const found = portals.find((p: any) => p.alias === alias);
      if (!found) throw new Error("Portal not found");
      return found;
    }
    const cmd = this.ensurePortalCommands();
    return await cmd.show(alias);
  }

  async openPortal(alias: string): Promise<boolean> {
    if (this.isDbLike(this.service)) {
      return await this.service.openPortal(alias);
    }
    // Not implemented in PortalCommands yet; placeholder for future
    throw new Error("openPortal not implemented in CLI");
  }

  async closePortal(alias: string): Promise<boolean> {
    if (this.isDbLike(this.service)) {
      return await this.service.closePortal(alias);
    }
    // Not implemented in PortalCommands yet; placeholder for future
    throw new Error("closePortal not implemented in CLI");
  }

  async refreshPortal(alias: string): Promise<boolean> {
    if (this.isDbLike(this.service)) {
      return await this.service.refreshPortal(alias);
    }
    const cmd = this.ensurePortalCommands();
    await cmd.refresh(alias);
    return true;
  }

  async removePortal(alias: string, options?: { keepCard?: boolean }): Promise<boolean> {
    if (this.isDbLike(this.service)) {
      return await this.service.removePortal(alias, options);
    }
    const cmd = this.ensurePortalCommands();
    await cmd.remove(alias, options);
    return true;
  }

  async quickJumpToPortalDir(alias: string): Promise<string> {
    const details = await this.getPortalDetails(alias);
    return details.targetPath;
  }

  async getPortalFilesystemPath(alias: string): Promise<string> {
    const details = await this.getPortalDetails(alias);
    return details.targetPath;
  }

  getPortalActivityLog(_alias: string): string[] {
    // Not implemented in PortalCommands yet; placeholder for future
    return [
      `2025-12-22T12:00:00Z: Portal ${_alias} started`,
      `2025-12-22T12:05:00Z: No errors reported`,
    ];
  }

  // Placeholder for TUI rendering helpers
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
