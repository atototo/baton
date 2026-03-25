import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { useParams, useNavigate, useLocation, Navigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PROJECT_COLORS, isUuidLike, type ActivityEvent, type Agent, type Project, type ProjectStatus, type ProjectWorkspace } from "@atototo/shared";
import { CalendarRange, CircleDashed, Flag, FolderKanban, UserRound, BookOpen } from "lucide-react";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { assetsApi } from "../api/assets";
import { activityApi } from "../api/activity";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { ProjectProperties } from "../components/ProjectProperties";
import { InlineEditor } from "../components/InlineEditor";
import { StatusBadge } from "../components/StatusBadge";
import { IssuesList } from "../components/IssuesList";
import { PageSkeleton } from "../components/PageSkeleton";
import { ProjectConventionsEditor } from "../components/ProjectConventionsEditor";
import { projectRouteRef } from "../lib/utils";
import { ActivityRow } from "../components/ActivityRow";
import { EmptyState } from "../components/EmptyState";
import { AgentIcon } from "../components/AgentIconPicker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { FolderGit2, Settings2, Sparkles } from "lucide-react";

/* ── Top-level tab types ── */

type ProjectTab = "overview" | "updates" | "issues" | "conventions" | "settings";

function resolveProjectTab(pathname: string, projectId: string): ProjectTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1 || segments[projectsIdx + 1] !== projectId) return null;
  const tab = segments[projectsIdx + 2];
  if (tab === "overview") return "overview";
  if (tab === "updates") return "updates";
  if (tab === "issues") return "issues";
  if (tab === "conventions") return "conventions";
  if (tab === "settings") return "settings";
  return null;
}

/* ── Overview tab content ── */

function OverviewContent({
  project,
  leadAgentName,
  onUpdate,
  imageUploadHandler,
}: {
  project: Project;
  leadAgentName: string | null;
  onUpdate: (data: Record<string, unknown>) => void;
  imageUploadHandler?: (file: File) => Promise<string>;
}) {
  const { t } = useTranslation();
  const statusLabelKey: Record<ProjectStatus, string> = {
    backlog: "newProject.statuses.backlog",
    planned: "newProject.statuses.planned",
    in_progress: "newProject.statuses.inProgress",
    completed: "newProject.statuses.completed",
    cancelled: "newProject.statuses.cancelled",
  };
  const milestoneCount = 0;

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-xl border border-border bg-card/60"
        aria-label={t("projectDetail.propertiesBar")}
      >
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <PropertyPill
            icon={Flag}
            label={t("projectDetail.status")}
            value={<StatusBadge status={project.status} />}
          />
          <PropertyPill
            icon={UserRound}
            label={t("projectDetail.owner")}
            value={
              project.leadAgentId
                ? <Badge variant="outline" className="font-normal">{leadAgentName ?? project.leadAgentId.slice(0, 8)}</Badge>
                : t("projectDetail.noOwner")
            }
          />
          <PropertyPill
            icon={CalendarRange}
            label={t("projectDetail.dates")}
            value={project.targetDate ?? t("projectDetail.noTargetDate")}
          />
          <PropertyPill
            icon={FolderKanban}
            label={t("projectDetail.milestones")}
            value={t("projectDetail.milestoneCount", { count: milestoneCount })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{t("projectDetail.currentState")}</span>
          <Badge variant="secondary">{t(statusLabelKey[project.status])}</Badge>
          {project.targetDate && <span>{t("projectDetail.targetDateLabel", { date: project.targetDate })}</span>}
        </div>
      </section>

      <InlineEditor
        value={project.description ?? ""}
        onSave={(description) => onUpdate({ description })}
        as="p"
        className="text-sm text-muted-foreground"
        placeholder={t("projectDetail.addDescription")}
        multiline
        imageUploadHandler={imageUploadHandler}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">{t("projectDetail.status")}</span>
          <div className="mt-1">
            <StatusBadge status={project.status} />
          </div>
        </div>
        {project.targetDate && (
          <div>
            <span className="text-muted-foreground">{t("projectDetail.targetDate")}</span>
            <p>{project.targetDate}</p>
          </div>
        )}
      </div>

      <section className="space-y-3" aria-labelledby="project-milestones-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="project-milestones-heading" className="text-sm font-semibold text-foreground">
              {t("projectDetail.milestones")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("projectDetail.milestonesDescription")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled aria-disabled="true">
            {t("projectDetail.addMilestone")}
          </Button>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CircleDashed className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("projectDetail.noMilestonesTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("projectDetail.noMilestonesDescription")}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PropertyPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarRange;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className={cn("mt-2 text-sm text-foreground", typeof value === "string" && "font-medium")}>
        {value}
      </div>
    </div>
  );
}

/* ── Color picker popover ── */

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 h-5 w-5 rounded-md cursor-pointer hover:ring-2 hover:ring-foreground/20 transition-[box-shadow]"
        style={{ backgroundColor: currentColor }}
        aria-label={t("projectDetail.changeProjectColor")}
      />
      {open && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-popover border border-border rounded-lg shadow-lg z-50 w-max">
          <div className="grid grid-cols-5 gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-md cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-110 ${
                  color === currentColor
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:ring-2 hover:ring-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                aria-label={t("projectDetail.selectColor", { color })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── List (issues) tab content ── */

function ProjectIssuesList({ projectId, companyId }: { projectId: string; companyId: string }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey={`baton:project-view:${projectId}`}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
    />
  );
}

function ProjectUpdatesTab({
  companyId,
  projectId,
  projectName,
}: {
  companyId: string;
  projectId: string;
  projectName: string;
}) {
  const { t } = useTranslation();
  const { data: activity, isLoading, error } = useQuery({
    queryKey: [...queryKeys.activity(companyId), "project", projectId],
    queryFn: () => activityApi.list(companyId),
    enabled: !!companyId,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });
  const projectActivity = useMemo(
    () => (activity ?? []).filter((event) => event.entityType === "project" && event.entityId === projectId),
    [activity, projectId],
  );
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents ?? []) map.set(agent.id, agent);
    return map;
  }, [agents]);
  const entityNameMap = useMemo(() => new Map<string, string>([[`project:${projectId}`, projectName]]), [projectId, projectName]);

  if (isLoading) return <PageSkeleton variant="list" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (projectActivity.length === 0) {
    return <EmptyState icon={Sparkles} message={t("projectDetail.noUpdates")} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <ScrollArea className="max-h-[32rem]">
        <div className="divide-y divide-border">
          {projectActivity.map((event: ActivityEvent) => (
            <ActivityRow
              key={event.id}
              event={event}
              agentMap={agentMap}
              entityNameMap={entityNameMap}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: ProjectWorkspace }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{workspace.name}</h3>
        {workspace.isPrimary && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Primary
          </span>
        )}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        {workspace.cwd && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">CWD</dt>
            <dd className="break-all font-mono text-xs">{workspace.cwd}</dd>
          </div>
        )}
        {workspace.repoUrl && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Repo</dt>
            <dd className="break-all text-xs text-muted-foreground">{workspace.repoUrl}</dd>
          </div>
        )}
        {workspace.repoUrl && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Base Branch</dt>
            <dd className="break-all text-xs text-muted-foreground">{workspace.defaultBaseBranch ?? "main"}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function ProjectSettingsTab({
  project,
  onUpdate,
  isSaving,
}: {
  project: Project;
  onUpdate: (data: Record<string, unknown>) => void | Promise<unknown>;
  isSaving: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <ProjectProperties project={project} onUpdate={onUpdate} isSaving={isSaving} />
    </div>
  );
}

/* ── Main project page ── */

export function ProjectDetail() {
  const { t } = useTranslation();
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const { openPanel, closePanel, setPanelVisible } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const routeProjectRef = projectId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));

  const activeTab = routeProjectRef ? resolveProjectTab(location.pathname, routeProjectRef) : null;

  const { data: project, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId ?? ""),
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    setSelectedCompanyId(project.companyId, { source: "route_sync" });
  }, [project?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
    }
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: () => {
      invalidateProject();
      pushToast({
        tone: "success",
        title: t("projectProperties.basicInfoSaved", "기본 정보가 저장되었습니다."),
      });
    },
    onError: () => {
      pushToast({
        tone: "error",
        title: t("projectProperties.basicInfoSaveFailed", "기본 정보 저장에 실패했습니다."),
      });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error(t("projectDetail.noCompanySelected"));
      return assetsApi.uploadImage(resolvedCompanyId, file, `projects/${projectLookupRef || "draft"}`);
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.projects"), href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? t("projectDetail.project") },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef, t]);

  useEffect(() => {
    if (!project) return;
    if (routeProjectRef === canonicalProjectRef) return;
    if (activeTab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`, { replace: true });
      return;
    }
    if (activeTab === "updates") {
      navigate(`/projects/${canonicalProjectRef}/updates`, { replace: true });
      return;
    }
    if (activeTab === "issues") {
      if (filter) {
        navigate(`/projects/${canonicalProjectRef}/issues/${filter}`, { replace: true });
        return;
      }
      navigate(`/projects/${canonicalProjectRef}/issues`, { replace: true });
      return;
    }
    if (activeTab === "conventions") {
      navigate(`/projects/${canonicalProjectRef}/conventions`, { replace: true });
      return;
    }
    if (activeTab === "settings") {
      navigate(`/projects/${canonicalProjectRef}/settings`, { replace: true });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, activeTab, filter, navigate]);

  useEffect(() => {
    if (project) {
      openPanel(
        <ProjectProperties
          project={project}
          onUpdate={(data) => updateProject.mutateAsync(data)}
          isSaving={updateProject.isPending}
        />,
      );
    }
    return () => closePanel();
  }, [project, updateProject.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!project) return;
    setPanelVisible(true);
  }, [activeTab, project, setPanelVisible]);

  // Redirect bare /projects/:id to /projects/:id/issues
  if (routeProjectRef && activeTab === null) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!project) return null;

  const leadAgentName =
    project.leadAgentId != null
      ? agents?.find((agent) => agent.id === project.leadAgentId)?.name ?? project.leadAgentId.slice(0, 8)
      : null;

  const handleTabChange = (tab: ProjectTab) => {
    if (tab === "overview") navigate(`/projects/${canonicalProjectRef}/overview`);
    if (tab === "updates") navigate(`/projects/${canonicalProjectRef}/updates`);
    if (tab === "issues") navigate(`/projects/${canonicalProjectRef}/issues`);
    if (tab === "conventions") navigate(`/projects/${canonicalProjectRef}/conventions`);
    if (tab === "settings") navigate(`/projects/${canonicalProjectRef}/settings`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-7 flex items-center">
          <ColorPicker
            currentColor={project.color ?? "#6366f1"}
            onSelect={(color) => updateProject.mutate({ color })}
          />
        </div>
        <InlineEditor
          value={project.name}
          onSave={(name) => updateProject.mutate({ name })}
          as="h2"
          className="text-xl font-bold"
        />
      </div>

      {/* Top-level project tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {([
          ["overview", t("projectDetail.overview")],
          ["updates", t("projectDetail.updates")],
          ["issues", t("projectDetail.issues")],
          ["conventions", t("projectDetail.conventions")],
          ["settings", t("projectDetail.settings")],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleTabChange(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewContent
          project={project}
          leadAgentName={leadAgentName}
          onUpdate={(data) => updateProject.mutate(data)}
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      )}

      {activeTab === "updates" && project?.id && resolvedCompanyId && (
        <ProjectUpdatesTab
          companyId={resolvedCompanyId}
          projectId={project.id}
          projectName={project.name}
        />
      )}

      {activeTab === "issues" && project?.id && resolvedCompanyId && (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} />
      )}

      {activeTab === "conventions" && project?.id && resolvedCompanyId && (
        <ProjectConventionsEditor
          projectId={project.id}
          companyId={resolvedCompanyId}
        />
      )}

      {activeTab === "settings" && project?.id && resolvedCompanyId && (
        <ProjectSettingsTab
          project={project}
          onUpdate={(data) => updateProject.mutateAsync(data)}
          isSaving={updateProject.isPending}
        />
      )}
    </div>
  );
}
