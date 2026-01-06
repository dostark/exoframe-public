import { join } from "@std/path";

export function getWorkspaceDir(argDir: string) {
  return join(argDir, "Workspace");
}

export function getWorkspaceActiveDir(argDir: string) {
  return join(argDir, "Workspace", "Active");
}

export function getWorkspacePlansDir(argDir: string) {
  return join(argDir, "Workspace", "Plans");
}

export function getWorkspaceRequestsDir(argDir: string) {
  return join(argDir, "Workspace", "Requests");
}

export function getWorkspaceArchiveDir(argDir: string) {
  return join(argDir, "Workspace", "Archive");
}

export function getWorkspaceRejectedDir(argDir: string) {
  return join(argDir, "Workspace", "Rejected");
}

export function getRuntimeDir(argDir: string) {
  return join(argDir, ".exo");
}

export function getMemoryDir(argDir: string) {
  return join(argDir, "Memory");
}

export function getBlueprintsAgentsDir(argDir: string) {
  return join(argDir, "Blueprints", "Agents");
}

export function getMemoryExecutionDir(argDir: string) {
  return join(argDir, "Memory", "Execution");
}

export function getMemoryProjectsDir(argDir: string) {
  return join(argDir, "Memory", "Projects");
}

export function getMemoryGlobalDir(argDir: string) {
  return join(argDir, "Memory", "Global");
}

export function getMemoryIndexDir(argDir: string) {
  return join(argDir, "Memory", "Index");
}

export function getMemorySkillsDir(argDir: string) {
  return join(argDir, "Memory", "Skills");
}

export function getMemoryPendingDir(argDir: string) {
  return join(argDir, "Memory", "Pending");
}

export function getMemoryTasksDir(argDir: string) {
  return join(argDir, "Memory", "Tasks");
}

export function getPortalsDir(argDir: string) {
  return join(argDir, "Portals");
}
