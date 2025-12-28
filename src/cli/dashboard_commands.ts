import { BaseCommand, type CommandContext } from "./base.ts";
import { launchTuiDashboard } from "../tui/tui_dashboard.ts";

export class DashboardCommands extends BaseCommand {
  constructor(context: CommandContext) {
    super(context);
  }

  async show(): Promise<void> {
    await launchTuiDashboard();
  }
}
