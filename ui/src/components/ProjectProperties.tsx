import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_STATUSES, type Project, type ProjectStatus } from "@atototo/shared";
import { InlineHelp } from "./InlineHelp";
import { StatusBadge } from "./StatusBadge";
import { formatDate } from "../lib/utils";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarDays, ExternalLink, FolderOpen, Github, GitBranch, Plus, Save, Trash2, User, X } from "lucide-react";
import { ChoosePathButton } from "./PathInstructionsModal";
import { AgentIcon } from "./AgentIconPicker";
import { HintIcon, useHelpText } from "./agent-config-primitives";

interface ProjectPropertiesProps {
  project: Project;
  onUpdate?: (data: Record<string, unknown>) => void | Promise<unknown>;
  isSaving?: boolean;
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
      <div className="overflow-hidden rounded-md border border-border bg-muted/50">
        <div className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1.1fr)] border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t("projectHelp.columns.mode")}</span>
          <span>{t("projectHelp.columns.meaning")}</span>
          <span>{t("projectHelp.columns.example")}</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1.1fr)] gap-3 border-t border-border px-3 py-2 text-xs first:border-t-0"
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
  isSaving = false,
}: ProjectPropertiesProps) {
  const { t } = useTranslation();
  const help = useHelpText();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  /* ── Local draft state (saved only on explicit Save click) ── */
  const initialGoalIds =
    project.goalIds.length > 0
      ? project.goalIds
      : project.goalId
      ? [project.goalId]
      : [];

  const [draftStatus, setDraftStatus] = useState<ProjectStatus>(project.status);
  const [draftLeadAgentId, setDraftLeadAgentId] = useState<string | null>(project.leadAgentId);
  const [draftGoalIds, setDraftGoalIds] = useState<string[]>(initialGoalIds);
  const [draftTargetDate, setDraftTargetDate] = useState(project.targetDate ?? "");

  // Reset draft when project prop changes (e.g. after save completes)
  useEffect(() => {
    setDraftStatus(project.status);
    setDraftLeadAgentId(project.leadAgentId);
    setDraftGoalIds(
      project.goalIds.length > 0
        ? project.goalIds
        : project.goalId
        ? [project.goalId]
        : [],
    );
    setDraftTargetDate(project.targetDate ?? "");
  }, [project.status, project.leadAgentId, project.goalIds, project.goalId, project.targetDate]);

  const isDirty = useMemo(() => {
    if (draftStatus !== project.status) return true;
    if (draftLeadAgentId !== project.leadAgentId) return true;
    if ((draftTargetDate || null) !== (project.targetDate || null)) return true;
    const currentGoalIds =
      project.goalIds.length > 0
        ? project.goalIds
        : project.goalId
        ? [project.goalId]
        : [];
    if (draftGoalIds.length !== currentGoalIds.length) return true;
    if (draftGoalIds.some((id, i) => id !== currentGoalIds[i])) return true;
    return false;
  }, [draftStatus, draftLeadAgentId, draftTargetDate, draftGoalIds, project]);

  const handleSave = () => {
    if (!onUpdate || !isDirty) return;
    const payload: Record<string, unknown> = {};
    if (draftStatus !== project.status) payload.status = draftStatus;
    if (draftLeadAgentId !== project.leadAgentId) payload.leadAgentId = draftLeadAgentId;
    if ((draftTargetDate || null) !== (project.targetDate || null)) {
      payload.targetDate = draftTargetDate || null;
    }
    const currentGoalIds =
      project.goalIds.length > 0
        ? project.goalIds
        : project.goalId
        ? [project.goalId]
        : [];
    if (
      draftGoalIds.length !== currentGoalIds.length ||
      draftGoalIds.some((id, i) => id !== currentGoalIds[i])
    ) {
      payload.goalIds = draftGoalIds;
    }
    void onUpdate(payload);
  };

  const handleDiscard = () => {
    setDraftStatus(project.status);
    setDraftLeadAgentId(project.leadAgentId);
    setDraftGoalIds(initialGoalIds);
    setDraftTargetDate(project.targetDate ?? "");
  };

  /* ── Popover state ── */
  const [goalOpen, setGoalOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"local" | "repo" | null>(null);
  const [workspaceCwd, setWorkspaceCwd] = useState("");
  const [workspaceRepoUrl, setWorkspaceRepoUrl] = useState("");
  const [workspaceBaseBranch, setWorkspaceBaseBranch] = useState("main");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [editingBaseBranchWorkspaceId, setEditingBaseBranchWorkspaceId] = useState<string | null>(null);
  const [editingBaseBranchValue, setEditingBaseBranchValue] = useState("main");

  /* ── Data queries ── */
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

  const draftGoals =
    project.goals.length > 0
      ? project.goals.filter((g) => draftGoalIds.includes(g.id))
      : draftGoalIds.map((id) => ({
          id,
          title: allGoals?.find((g) => g.id === id)?.title ?? id.slice(0, 8),
        }));

  const availableGoals = (allGoals ?? []).filter(
    (g) => !draftGoalIds.includes(g.id)
  );
  const availableAgents = (agents ?? []).filter((agent) => agent.status !== "terminated");
  const draftLeadAgent =
    draftLeadAgentId != null
      ? availableAgents.find((agent) => agent.id === draftLeadAgentId) ?? null
      : null;
  const workspaces = project.workspaces ?? [];

  /* ── Workspace mutations (these save immediately) ── */
  const updateProjectCaches = (
    updater: (current: Project) => Project,
  ) => {
    queryClient.setQueriesData<Project>(
      {
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "projects" &&
          query.queryKey[1] === "detail",
      },
      (current) => (current && current.id === project.id ? updater(current) : current),
    );
    if (selectedCompanyId) {
      queryClient.setQueryData<Project[]>(queryKeys.projects.list(selectedCompanyId), (current) =>
        current
          ? current.map((item) => (item.id === project.id ? updater(item) : item))
          : current,
      );
    }
  };

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
    onSuccess: (workspace) => {
      setWorkspaceCwd("");
      setWorkspaceRepoUrl("");
      setWorkspaceBaseBranch("main");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      updateProjectCaches((current) => ({
        ...current,
        workspaces: [...(current.workspaces ?? []), workspace],
      }));
      invalidateProject();
      pushToast({
        tone: "success",
        title: t("projectProperties.workspaceSaved", "워크스페이스가 저장되었습니다."),
      });
    },
    onError: () => {
      pushToast({
        tone: "error",
        title: t("projectProperties.workspaceSaveFailed", "워크스페이스 저장에 실패했습니다."),
      });
    },
  });

  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) =>
      projectsApi.removeWorkspace(project.id, workspaceId),
    onSuccess: (deletedWorkspace) => {
      updateProjectCaches((current) => ({
        ...current,
        workspaces: (current.workspaces ?? []).filter((item) => item.id !== deletedWorkspace.id),
      }));
      invalidateProject();
      pushToast({
        tone: "success",
        title: t("projectProperties.workspaceDeleted", "워크스페이스가 삭제되었습니다."),
      });
    },
    onError: () => {
      pushToast({
        tone: "error",
        title: t("projectProperties.workspaceDeleteFailed", "워크스페이스 삭제에 실패했습니다."),
      });
    },
  });
  const updateWorkspace = useMutation({
    mutationFn: ({
      workspaceId,
      data,
    }: {
      workspaceId: string;
      data: Record<string, unknown>;
    }) => projectsApi.updateWorkspace(project.id, workspaceId, data),
    onSuccess: (workspace) => {
      updateProjectCaches((current) => ({
        ...current,
        workspaces: (current.workspaces ?? []).map((item) =>
          item.id === workspace.id ? workspace : item,
        ),
      }));
      invalidateProject();
      pushToast({
        tone: "success",
        title: t("projectProperties.workspaceUpdated", "워크스페이스가 업데이트되었습니다."),
      });
    },
    onError: () => {
      pushToast({
        tone: "error",
        title: t("projectProperties.workspaceUpdateFailed", "워크스페이스 업데이트에 실패했습니다."),
      });
    },
  });

  /* ── Goal helpers (now modify draft, not server) ── */
  const removeGoal = (goalId: string) => {
    setDraftGoalIds((prev) => prev.filter((id) => id !== goalId));
  };

  const addGoal = (goalId: string) => {
    if (draftGoalIds.includes(goalId)) return;
    setDraftGoalIds((prev) => [...prev, goalId]);
    setGoalOpen(false);
  };

  /* ── Workspace helpers ── */
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
      defaultBaseBranch: workspaceBaseBranch.trim() || "main",
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
      defaultBaseBranch: workspaceBaseBranch.trim() || "main",
    });
  };

  const startWorkspaceBaseBranchEdit = (workspace: Project["workspaces"][number]) => {
    setEditingBaseBranchWorkspaceId(workspace.id);
    setEditingBaseBranchValue(workspace.defaultBaseBranch ?? "main");
  };

  const submitWorkspaceBaseBranch = (workspace: Project["workspaces"][number]) => {
    updateWorkspace.mutate({
      workspaceId: workspace.id,
      data: { defaultBaseBranch: editingBaseBranchValue.trim() || null },
    }, {
      onSuccess: () => {
        setEditingBaseBranchWorkspaceId(null);
        setEditingBaseBranchValue("main");
      },
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

  const localWorkspaces = workspaces.filter(
    (ws) => ws.cwd && ws.cwd !== REPO_ONLY_CWD_SENTINEL,
  );
  const repoWorkspaces = workspaces.filter((ws) => ws.repoUrl);

  return (
    <div className="space-y-6">
      {/* ── Save / Discard bar ── */}
      {isDirty && onUpdate && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
            <Save className="h-3.5 w-3.5 text-primary" />
            <span className="flex-1 text-sm text-primary">
            {t("projectProperties.basicInfoUnsavedChanges", "기본 정보에 저장하지 않은 변경사항이 있습니다.")}
            </span>
          <Button variant="ghost" size="sm" className="h-8 px-3" onClick={handleDiscard}>
            {t("common.discard", "취소")}
          </Button>
          <Button size="sm" className="h-8 px-4" onClick={handleSave} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? t("common.saving", "저장 중…") : t("common.save", "저장")}
          </Button>
        </div>
      )}

      {/* ── Section 1: Basic Properties ── */}
      <section className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("projectProperties.basicInfo", "기본 정보")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "projectProperties.basicInfoSaveMode",
              "이 섹션의 변경사항은 상단 저장 버튼을 눌러 반영합니다.",
            )}
          </p>
        </div>
        <div className="divide-y divide-border">
          {/* Status */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">
              {t("projectDetail.status")}
            </span>
            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                  <StatusBadge status={draftStatus} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start">
                {projectStatuses.map((status) => (
                  <button
                    key={status.value}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50 ${
                      status.value === draftStatus ? "bg-accent" : ""
                    }`}
                    onClick={() => {
                      setDraftStatus(status.value);
                      setStatusOpen(false);
                    }}
                  >
                    <StatusBadge status={status.value} />
                    <span className="truncate">{status.label}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Lead Agent */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">
              {t("projectDetail.leadAgent", "리드 에이전트")}
            </span>
            <Popover open={leadOpen} onOpenChange={setLeadOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                  {draftLeadAgent ? (
                    <>
                      <AgentIcon icon={draftLeadAgent.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{draftLeadAgent.name}</span>
                    </>
                  ) : draftLeadAgentId ? (
                    <span className="text-sm font-mono">{draftLeadAgentId.slice(0, 8)}</span>
                  ) : (
                    <>
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("common.none")}</span>
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="start">
                <button
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50 ${!draftLeadAgentId ? "bg-accent" : ""}`}
                  onClick={() => { setDraftLeadAgentId(null); setLeadOpen(false); }}
                >
                  <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {t("projectProperties.noLead")}
                </button>
                {availableAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50 ${agent.id === draftLeadAgentId ? "bg-accent" : ""}`}
                    onClick={() => { setDraftLeadAgentId(agent.id); setLeadOpen(false); }}
                  >
                    <AgentIcon icon={agent.icon} className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{agent.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Goals */}
          <div className="flex items-start gap-4 px-4 py-3">
            <span className="w-28 shrink-0 pt-1 text-sm text-muted-foreground">
              {t("projectProperties.goal", "목표")}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {draftGoals.length === 0 && (
                <span className="text-sm text-muted-foreground">{t("common.none")}</span>
              )}
              {draftGoals.map((goal) => (
                <span
                  key={goal.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
                >
                  <Link to={`/goals/${goal.id}`} className="hover:underline max-w-[180px] truncate">
                    {goal.title}
                  </Link>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={() => removeGoal(goal.id)}
                    aria-label={`Remove goal ${goal.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <Popover open={goalOpen} onOpenChange={setGoalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="xs" className="h-6 px-2" disabled={availableGoals.length === 0}>
                    <Plus className="h-3 w-3 mr-1" />
                    {t("projectProperties.goal")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="start">
                  {availableGoals.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("projectProperties.allGoalsLinked")}</div>
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
            </div>
          </div>

          {/* Target Date */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">
              {t("projectDetail.targetDate", "목표일")}
            </span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  className="h-8 rounded-md border border-border bg-transparent pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={draftTargetDate}
                  onChange={(e) => setDraftTargetDate(e.target.value)}
                />
              </div>
              {draftTargetDate && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setDraftTargetDate("")}
                  aria-label={t("projectProperties.clearTargetDate", "Clear target date")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Created / Updated */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">
              {t("projectProperties.created", "생성일")}
            </span>
            <span className="text-sm">{formatDate(project.createdAt)}</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">
              {t("projectProperties.updated", "수정일")}
            </span>
            <span className="text-sm">{formatDate(project.updatedAt)}</span>
          </div>
        </div>
      </section>

      {/* ── Section 2: Workspaces ── */}
      <section className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {t("projectProperties.workspaces")}
              </h3>
              <HintIcon
                hint={{
                  text: help.workspaceTooltip,
                  popoverContent: <WorkspaceHelpContent />,
                  ariaLabel: help.workspaceLabel,
                  popoverClassName: "border-border bg-popover",
                }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "projectProperties.workspaceSaveMode",
                "이 섹션의 변경사항은 저장 즉시 반영됩니다.",
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              className="h-7 px-2.5"
              onClick={() => { setWorkspaceMode("local"); setWorkspaceError(null); }}
            >
              <FolderOpen className="h-3 w-3 mr-1" />
              {t("projectProperties.addWorkspaceLocal")}
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="h-7 px-2.5"
              onClick={() => { setWorkspaceMode("repo"); setWorkspaceError(null); }}
            >
              <GitBranch className="h-3 w-3 mr-1" />
              {t("projectProperties.addWorkspaceRepo")}
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <InlineHelp
            title={t("inlineHelp.workspace.title")}
            summary={t("inlineHelp.workspace.summary")}
            defaultOpen={workspaces.length === 0}
          >
            <ul className="space-y-1.5">
              <li>{t("projectHelp.workspaceModes.local.value")}</li>
              <li>{t("projectHelp.workspaceModes.repo.value")}</li>
              <li>{t("projectHelp.workspaceModes.both.value")}</li>
              <li>{t("inlineHelp.workspace.recommendation")}</li>
            </ul>
          </InlineHelp>

          {workspaces.length === 0 && !workspaceMode ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">{t("projectProperties.noWorkspace")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Local folders */}
              {localWorkspaces.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("projectProperties.localFolders", "로컬 폴더")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {localWorkspaces.map((workspace) => (
                      <div
                        key={`local-${workspace.id}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <span className="min-w-0 truncate font-mono text-xs">
                          {workspace.cwd}
                        </span>
                        <div className="flex items-center gap-1">
                          <Popover
                            open={editingBaseBranchWorkspaceId === workspace.id}
                            onOpenChange={(open) => {
                              if (open) {
                                startWorkspaceBaseBranchEdit(workspace);
                              } else if (editingBaseBranchWorkspaceId === workspace.id) {
                                setEditingBaseBranchWorkspaceId(null);
                                setEditingBaseBranchValue("main");
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                {workspace.defaultBaseBranch ?? "main"}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-64 space-y-2 p-3">
                              <PopoverHeader>
                                <PopoverTitle>{t("projectProperties.defaultBaseBranch", "기본 베이스 브랜치")}</PopoverTitle>
                                <PopoverDescription className="text-xs">
                                  {t(
                                    "projectProperties.defaultBaseBranchHelp",
                                    "워크트리 브랜치 생성 시 이 브랜치를 기준으로 사용합니다.",
                                  )}
                                </PopoverDescription>
                              </PopoverHeader>
                              <input
                                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                                value={editingBaseBranchValue}
                                onChange={(e) => setEditingBaseBranchValue(e.target.value)}
                                placeholder="main"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="h-7 px-3"
                                  onClick={() => {
                                    setEditingBaseBranchWorkspaceId(null);
                                    setEditingBaseBranchValue("main");
                                  }}
                                >
                                  {t("common.discard", "취소")}
                                </Button>
                                <Button
                                  size="xs"
                                  className="h-7 px-3"
                                  disabled={updateWorkspace.isPending}
                                  onClick={() => submitWorkspaceBaseBranch(workspace)}
                                >
                                  {t("common.save", "저장")}
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0"
                            onClick={() => clearLocalWorkspace(workspace)}
                            aria-label={t("projectProperties.deleteLocalFolder")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repository links */}
              {repoWorkspaces.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Github className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("projectProperties.repositories", "저장소")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {repoWorkspaces.map((workspace) => (
                      <div
                        key={`repo-${workspace.id}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <a
                          href={workspace.repoUrl!}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1.5 text-xs hover:text-foreground hover:underline"
                        >
                          <span className="truncate">{formatGitHubRepo(workspace.repoUrl!)}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </a>
                        <div className="flex items-center gap-1">
                          <Popover
                            open={editingBaseBranchWorkspaceId === workspace.id}
                            onOpenChange={(open) => {
                              if (open) {
                                startWorkspaceBaseBranchEdit(workspace);
                              } else if (editingBaseBranchWorkspaceId === workspace.id) {
                                setEditingBaseBranchWorkspaceId(null);
                                setEditingBaseBranchValue("main");
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                {workspace.defaultBaseBranch ?? "main"}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-64 space-y-2 p-3">
                              <PopoverHeader>
                                <PopoverTitle>{t("projectProperties.defaultBaseBranch", "기본 베이스 브랜치")}</PopoverTitle>
                                <PopoverDescription className="text-xs">
                                  {t(
                                    "projectProperties.defaultBaseBranchHelp",
                                    "워크트리 브랜치 생성 시 이 브랜치를 기준으로 사용합니다.",
                                  )}
                                </PopoverDescription>
                              </PopoverHeader>
                              <input
                                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                                value={editingBaseBranchValue}
                                onChange={(e) => setEditingBaseBranchValue(e.target.value)}
                                placeholder="main"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="h-7 px-3"
                                  onClick={() => {
                                    setEditingBaseBranchWorkspaceId(null);
                                    setEditingBaseBranchValue("main");
                                  }}
                                >
                                  {t("common.discard", "취소")}
                                </Button>
                                <Button
                                  size="xs"
                                  className="h-7 px-3"
                                  disabled={updateWorkspace.isPending}
                                  onClick={() => submitWorkspaceBaseBranch(workspace)}
                                >
                                  {t("common.save", "저장")}
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0"
                            onClick={() => clearRepoWorkspace(workspace)}
                            aria-label={t("projectProperties.deleteWorkspaceRepo")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add workspace forms */}
          {workspaceMode === "local" && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" />
                {t("projectProperties.addWorkspaceLocal")}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
                  value={workspaceCwd}
                  onChange={(e) => setWorkspaceCwd(e.target.value)}
                  placeholder="/absolute/path/to/workspace"
                />
                <ChoosePathButton />
              </div>
              <input
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                value={workspaceBaseBranch}
                onChange={(e) => setWorkspaceBaseBranch(e.target.value)}
                placeholder={t("projectProperties.defaultBaseBranchPlaceholder", "main")}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  className="h-7 px-3"
                  disabled={!workspaceCwd.trim() || createWorkspace.isPending}
                  onClick={submitLocalWorkspace}
                >
                  {t("common.save", "저장")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-7 px-3"
                  onClick={() => {
                    setWorkspaceMode(null);
                    setWorkspaceCwd("");
                    setWorkspaceBaseBranch("main");
                    setWorkspaceError(null);
                  }}
                >
                  {t("common.discard", "취소")}
                </Button>
              </div>
            </div>
          )}
          {workspaceMode === "repo" && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                {t("projectProperties.addWorkspaceRepo")}
              </div>
              <input
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                value={workspaceRepoUrl}
                onChange={(e) => setWorkspaceRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
              />
              <input
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                value={workspaceBaseBranch}
                onChange={(e) => setWorkspaceBaseBranch(e.target.value)}
                placeholder={t("projectProperties.defaultBaseBranchPlaceholder", "main")}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  className="h-7 px-3"
                  disabled={!workspaceRepoUrl.trim() || createWorkspace.isPending}
                  onClick={submitRepoWorkspace}
                >
                  {t("common.save", "저장")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-7 px-3"
                  onClick={() => { setWorkspaceMode(null); setWorkspaceRepoUrl(""); setWorkspaceBaseBranch("main"); setWorkspaceError(null); }}
                >
                  {t("common.discard", "취소")}
                </Button>
              </div>
            </div>
          )}
          {workspaceError && <p className="text-xs text-destructive">{workspaceError}</p>}
          {createWorkspace.isError && <p className="text-xs text-destructive">Failed to save workspace.</p>}
          {removeWorkspace.isError && <p className="text-xs text-destructive">Failed to delete workspace.</p>}
          {updateWorkspace.isError && <p className="text-xs text-destructive">Failed to update workspace.</p>}
        </div>
      </section>
    </div>
  );
}
