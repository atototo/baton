import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_STATUSES, type Project } from "@atototo/shared";
import { InlineHelp } from "./InlineHelp";
import { StatusBadge } from "./StatusBadge";
import { formatDate } from "../lib/utils";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ExternalLink, Github, Plus, Trash2, User, X } from "lucide-react";
import { ChoosePathButton } from "./PathInstructionsModal";
import { AgentIcon } from "./AgentIconPicker";
import { HintIcon, useHelpText } from "./agent-config-primitives";

interface ProjectPropertiesProps {
  project: Project;
  onUpdate?: (data: Record<string, unknown>) => void;
}

const REPO_ONLY_CWD_SENTINEL = "/__baton_repo_only__";

function PropertyRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground w-20">
        <span>{label}</span>
        {hint && <HintIcon hint={hint} />}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

function WorkspaceHelpContent() {
  const { t } = useTranslation();

  const rows = [
    {
      key: "local",
      name: t("projectHelp.workspaceModes.local.name"),
      value: t("projectHelp.workspaceModes.local.value"),
      example: t("projectHelp.workspaceModes.local.example"),
    },
    {
      key: "repo",
      name: t("projectHelp.workspaceModes.repo.name"),
      value: t("projectHelp.workspaceModes.repo.value"),
      example: t("projectHelp.workspaceModes.repo.example"),
    },
    {
      key: "both",
      name: t("projectHelp.workspaceModes.both.name"),
      value: t("projectHelp.workspaceModes.both.value"),
      example: t("projectHelp.workspaceModes.both.example"),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("projectHelp.workspaceTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("projectHelp.workspaceDescription")}
        </p>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-blue-950/30">
        <div className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1.1fr)] border-b border-border/80 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t("projectHelp.columns.mode")}</span>
          <span>{t("projectHelp.columns.meaning")}</span>
          <span>{t("projectHelp.columns.example")}</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1.1fr)] gap-3 border-t border-border/60 px-3 py-2 text-xs first:border-t-0"
          >
            <span className="font-medium text-foreground">{row.name}</span>
            <span className="text-muted-foreground">{row.value}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {row.example}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectProperties({
  project,
  onUpdate,
}: ProjectPropertiesProps) {
  const { t } = useTranslation();
  const help = useHelpText();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"local" | "repo" | null>(
    null
  );
  const [workspaceCwd, setWorkspaceCwd] = useState("");
  const [workspaceRepoUrl, setWorkspaceRepoUrl] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const projectStatuses = PROJECT_STATUSES.map((value) => ({
    value,
    label:
      value === "backlog"
        ? t("newProject.statuses.backlog")
        : value === "planned"
          ? t("newProject.statuses.planned")
          : value === "in_progress"
            ? t("newProject.statuses.inProgress")
            : value === "completed"
              ? t("newProject.statuses.completed")
              : t("newProject.statuses.cancelled"),
  }));

  const linkedGoalIds =
    project.goalIds.length > 0
      ? project.goalIds
      : project.goalId
      ? [project.goalId]
      : [];

  const linkedGoals =
    project.goals.length > 0
      ? project.goals
      : linkedGoalIds.map((id) => ({
          id,
          title: allGoals?.find((g) => g.id === id)?.title ?? id.slice(0, 8),
        }));

  const availableGoals = (allGoals ?? []).filter(
    (g) => !linkedGoalIds.includes(g.id)
  );
  const availableAgents = (agents ?? []).filter((agent) => agent.status !== "terminated");
  const leadAgent =
    project.leadAgentId != null
      ? availableAgents.find((agent) => agent.id === project.leadAgentId) ?? null
      : null;
  const workspaces = project.workspaces ?? [];

  const invalidateProject = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.projects.detail(project.id),
    });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.list(selectedCompanyId),
      });
    }
  };

  const createWorkspace = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.createWorkspace(project.id, data),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceRepoUrl("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });

  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) =>
      projectsApi.removeWorkspace(project.id, workspaceId),
    onSuccess: invalidateProject,
  });
  const updateWorkspace = useMutation({
    mutationFn: ({
      workspaceId,
      data,
    }: {
      workspaceId: string;
      data: Record<string, unknown>;
    }) => projectsApi.updateWorkspace(project.id, workspaceId, data),
    onSuccess: invalidateProject,
  });

  const removeGoal = (goalId: string) => {
    if (!onUpdate) return;
    onUpdate({ goalIds: linkedGoalIds.filter((id) => id !== goalId) });
  };

  const addGoal = (goalId: string) => {
    if (!onUpdate || linkedGoalIds.includes(goalId)) return;
    onUpdate({ goalIds: [...linkedGoalIds, goalId] });
    setGoalOpen(false);
  };

  const isAbsolutePath = (value: string) =>
    value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);

  const isGitHubRepoUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (host !== "github.com" && host !== "www.github.com") return false;
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments.length >= 2;
    } catch {
      return false;
    }
  };

  const deriveWorkspaceNameFromPath = (value: string) => {
    const normalized = value.trim().replace(/[\\/]+$/, "");
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? "Local folder";
  };

  const deriveWorkspaceNameFromRepo = (value: string) => {
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const repo = segments[segments.length - 1]?.replace(/\.git$/i, "") ?? "";
      return repo || "GitHub repo";
    } catch {
      return "GitHub repo";
    }
  };

  const formatGitHubRepo = (value: string) => {
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return value;
      const owner = segments[0];
      const repo = segments[1]?.replace(/\.git$/i, "");
      if (!owner || !repo) return value;
      return `${owner}/${repo}`;
    } catch {
      return value;
    }
  };

  const submitLocalWorkspace = () => {
    const cwd = workspaceCwd.trim();
    if (!isAbsolutePath(cwd)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    setWorkspaceError(null);
    createWorkspace.mutate({
      name: deriveWorkspaceNameFromPath(cwd),
      cwd,
    });
  };

  const submitRepoWorkspace = () => {
    const repoUrl = workspaceRepoUrl.trim();
    if (!isGitHubRepoUrl(repoUrl)) {
      setWorkspaceError("Repo workspace must use a valid GitHub repo URL.");
      return;
    }
    setWorkspaceError(null);
    createWorkspace.mutate({
      name: deriveWorkspaceNameFromRepo(repoUrl),
      cwd: REPO_ONLY_CWD_SENTINEL,
      repoUrl,
    });
  };

  const clearLocalWorkspace = (workspace: Project["workspaces"][number]) => {
    const confirmed = window.confirm(
      workspace.repoUrl
        ? "Clear local folder from this workspace?"
        : "Delete this workspace local folder?"
    );
    if (!confirmed) return;
    if (workspace.repoUrl) {
      updateWorkspace.mutate({
        workspaceId: workspace.id,
        data: { cwd: null },
      });
      return;
    }
    removeWorkspace.mutate(workspace.id);
  };

  const clearRepoWorkspace = (workspace: Project["workspaces"][number]) => {
    const hasLocalFolder = Boolean(
      workspace.cwd && workspace.cwd !== REPO_ONLY_CWD_SENTINEL
    );
    const confirmed = window.confirm(
      hasLocalFolder
        ? "Clear GitHub repo from this workspace?"
        : "Delete this workspace repo?"
    );
    if (!confirmed) return;
    if (hasLocalFolder) {
      updateWorkspace.mutate({
        workspaceId: workspace.id,
        data: { repoUrl: null, repoRef: null },
      });
      return;
    }
    removeWorkspace.mutate(workspace.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label="Status" hint={help.projectStatus}>
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-accent/50">
                <StatusBadge status={project.status} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="end">
              {projectStatuses.map((status) => (
                <button
                  key={status.value}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50 ${
                    status.value === project.status ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    onUpdate?.({ status: status.value });
                    setStatusOpen(false);
                  }}
                >
                  <StatusBadge status={status.value} />
                  <span className="truncate">{status.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </PropertyRow>
        <PropertyRow label="Lead" hint={help.leadAgentId}>
          <Popover open={leadOpen} onOpenChange={setLeadOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-accent/50">
                {leadAgent ? (
                  <>
                    <AgentIcon
                      icon={leadAgent.icon}
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="truncate text-sm">{leadAgent.name}</span>
                  </>
                ) : project.leadAgentId ? (
                  <span className="text-sm font-mono">
                    {project.leadAgentId.slice(0, 8)}
                  </span>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {t("common.none")}
                    </span>
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="end">
              <button
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50 ${
                  !project.leadAgentId ? "bg-accent" : ""
                }`}
                onClick={() => {
                  onUpdate?.({ leadAgentId: null });
                  setLeadOpen(false);
                }}
              >
                <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                {t("projectProperties.noLead")}
              </button>
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50 ${
                    agent.id === project.leadAgentId ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    onUpdate?.({ leadAgentId: agent.id });
                    setLeadOpen(false);
                  }}
                >
                  <AgentIcon
                    icon={agent.icon}
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </PropertyRow>
        <div className="py-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">Goals</span>
            <div className="flex flex-col items-end gap-1.5">
              {linkedGoals.length === 0 ? (
                <span className="text-sm text-muted-foreground">{t("common.none")}</span>
              ) : (
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[220px]">
                  {linkedGoals.map((goal) => (
                    <span
                      key={goal.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <Link
                        to={`/goals/${goal.id}`}
                        className="hover:underline max-w-[140px] truncate"
                      >
                        {goal.title}
                      </Link>
                      {onUpdate && (
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          type="button"
                          onClick={() => removeGoal(goal.id)}
                          aria-label={`Remove goal ${goal.title}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {onUpdate && (
                <Popover open={goalOpen} onOpenChange={setGoalOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-6 px-2"
                      disabled={availableGoals.length === 0}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {t("projectProperties.goal")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1" align="end">
                    {availableGoals.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {t("projectProperties.allGoalsLinked")}
                      </div>
                    ) : (
                      availableGoals.map((goal) => (
                        <button
                          key={goal.id}
                          className="flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
                          onClick={() => addGoal(goal.id)}
                        >
                          {goal.title}
                        </button>
                      ))
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
        <PropertyRow label="Target Date" hint={help.targetDate}>
          {project.targetDate ? (
            <span className="text-sm">{formatDate(project.targetDate)}</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("common.none")}
            </span>
          )}
        </PropertyRow>
      </div>

      <Separator />

      <div className="space-y-1">
        <div className="py-1.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t("projectProperties.workspaces")}</span>
            <HintIcon
              hint={{
                text: help.workspaceTooltip,
                popoverContent: <WorkspaceHelpContent />,
                ariaLabel: help.workspaceLabel,
                popoverClassName: "border-border bg-popover",
              }}
            />
          </div>
          <InlineHelp
            title={t("inlineHelp.workspace.title")}
            summary={t("inlineHelp.workspace.summary")}
          >
            <ul className="space-y-1.5">
              <li>{t("projectHelp.workspaceModes.local.value")}</li>
              <li>{t("projectHelp.workspaceModes.repo.value")}</li>
              <li>{t("projectHelp.workspaceModes.both.value")}</li>
              <li>{t("inlineHelp.workspace.recommendation")}</li>
            </ul>
          </InlineHelp>
          {workspaces.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {t("projectProperties.noWorkspace")}
            </p>
          ) : (
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <div key={workspace.id} className="space-y-1">
                  {workspace.cwd && workspace.cwd !== REPO_ONLY_CWD_SENTINEL ? (
                    <div className="flex items-center justify-between gap-2 py-1">
                      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                        {workspace.cwd}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => clearLocalWorkspace(workspace)}
                        aria-label={t("projectProperties.deleteLocalFolder")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null}
                  {workspace.repoUrl ? (
                    <div className="flex items-center justify-between gap-2 py-1">
                      <a
                        href={workspace.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <Github className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {formatGitHubRepo(workspace.repoUrl)}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => clearRepoWorkspace(workspace)}
                        aria-label={t("projectProperties.deleteWorkspaceRepo")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col items-start gap-2">
            <Button
              variant="outline"
              size="xs"
              className="h-7 px-2.5"
              onClick={() => {
                setWorkspaceMode("local");
                setWorkspaceError(null);
              }}
            >
              {t("projectProperties.addWorkspaceLocal")}
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="h-7 px-2.5"
              onClick={() => {
                setWorkspaceMode("repo");
                setWorkspaceError(null);
              }}
            >
              {t("projectProperties.addWorkspaceRepo")}
            </Button>
          </div>
          {workspaceMode === "local" && (
            <div className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                  value={workspaceCwd}
                  onChange={(e) => setWorkspaceCwd(e.target.value)}
                  placeholder="/absolute/path/to/workspace"
                />
                <ChoosePathButton />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 px-2"
                  disabled={!workspaceCwd.trim() || createWorkspace.isPending}
                  onClick={submitLocalWorkspace}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-2"
                  onClick={() => {
                    setWorkspaceMode(null);
                    setWorkspaceCwd("");
                    setWorkspaceError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {workspaceMode === "repo" && (
            <div className="space-y-1.5 rounded-md border border-border p-2">
              <input
                className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
                value={workspaceRepoUrl}
                onChange={(e) => setWorkspaceRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 px-2"
                  disabled={
                    !workspaceRepoUrl.trim() || createWorkspace.isPending
                  }
                  onClick={submitRepoWorkspace}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-2"
                  onClick={() => {
                    setWorkspaceMode(null);
                    setWorkspaceRepoUrl("");
                    setWorkspaceError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {workspaceError && (
            <p className="text-xs text-destructive">{workspaceError}</p>
          )}
          {createWorkspace.isError && (
            <p className="text-xs text-destructive">
              Failed to save workspace.
            </p>
          )}
          {removeWorkspace.isError && (
            <p className="text-xs text-destructive">
              Failed to delete workspace.
            </p>
          )}
          {updateWorkspace.isError && (
            <p className="text-xs text-destructive">
              Failed to update workspace.
            </p>
          )}
        </div>

        <Separator />

        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(project.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          <span className="text-sm">{formatDate(project.updatedAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
