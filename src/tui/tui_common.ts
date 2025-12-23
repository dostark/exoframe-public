/**
 * Shared TUI session utilities to reduce duplication between views.
 */
export abstract class TuiSessionBase {
  protected selectedIndex = 0;
  protected statusMessage = "";

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(idx: number, length: number): void {
    if (idx < 0 || idx >= length) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = idx;
    }
  }

  /**
   * Handle navigation keys (up/down/home/end) common to many TUI sessions.
   * Returns true if the key was a navigation key and handled.
   */
  handleNavigationKey(key: string, length: number): boolean {
    if (length === 0) return false;
    switch (key) {
      case "down":
        this.selectedIndex = Math.min(this.selectedIndex + 1, length - 1);
        return true;
      case "up":
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        return true;
      case "end":
        this.selectedIndex = length - 1;
        return true;
      case "home":
        this.selectedIndex = 0;
        return true;
    }
    return false;
  }

  clampSelection(length: number): void {
    if (this.selectedIndex >= length) {
      this.selectedIndex = Math.max(0, length - 1);
    }
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  protected async performAction(actionFn: () => Promise<unknown>): Promise<void> {
    try {
      await actionFn();
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
