type ProjectLike = {
  workspaces?: Array<{ cwd?: string | null }>;
  primaryWorkspace?: { cwd?: string | null } | null;
} | null;

export function sanitizeProjectWorkspacePaths<T extends ProjectLike>(project: T): T {
  if (!project) return project;
  return {
    ...project,
    workspaces: Array.isArray(project.workspaces)
      ? project.workspaces.map((workspace) => ({ ...workspace, cwd: null }))
      : project.workspaces,
    primaryWorkspace: project.primaryWorkspace ? { ...project.primaryWorkspace, cwd: null } : project.primaryWorkspace,
  };
}
