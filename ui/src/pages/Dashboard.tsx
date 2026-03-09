import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusBadge } from "../components/StatusBadge";
import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { Bot, CircleDot, LayoutDashboard, ShieldAlert, CheckCircle2 } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import { HandoffBar, type HandoffSummary } from "../components/HandoffBar";
import type { Agent, Issue } from "@atototo/shared";

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatSignedDelta(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function DashboardIssueRow({
  issue,
  assigneeName,
  compact = false,
  emphasized = false,
}: {
  issue: Issue;
  assigneeName: string | null;
  compact?: boolean;
  emphasized?: boolean;
}) {
  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      className={cn(
        "flex items-center gap-2.5 rounded-[6px] border bg-card text-inherit no-underline transition-all hover:bg-accent/30 hover:border-border",
        emphasized
          ? "border-red-500/18 bg-red-500/[0.04]"
          : issue.status === "blocked"
            ? "border-l-[3px] border-l-[var(--status-blocked)] border-y-0 border-r-0"
            : "border-border",
        compact ? "px-3 py-[7px]" : "px-3.5 py-[9px]",
      )}
    >
      <PriorityIcon priority={issue.priority} />
      <StatusIcon status={issue.status} />
      <span className="w-[60px] shrink-0 font-mono text-[11px] text-muted-foreground">
        {issue.identifier ?? issue.id.slice(0, 8)}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">{issue.title}</p>
      {assigneeName ? (
        <span className="hidden shrink-0 items-center gap-1 rounded border border-border bg-[var(--bg-overlay)] px-[7px] py-[2px] text-[11px] text-secondary-foreground sm:inline-flex">
          <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-[3px] bg-primary/10 text-[8px] font-bold text-primary">
            {getInitials(assigneeName)}
          </span>
          <span className="max-w-[110px] truncate">{assigneeName}</span>
        </span>
      ) : null}
      <span className="shrink-0">
        <StatusBadge status={issue.status} />
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {timeAgo(issue.updatedAt)}
      </span>
    </Link>
  );
}

function DashboardSectionTitle({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <h3 className="section-title mb-0 after:hidden">{title}</h3>
      {typeof count === "number" ? (
        <span className="rounded bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {count}
        </span>
      ) : null}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);
  const [dismissedHandoffId, setDismissedHandoffId] = useState<string | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.dashboard") }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const blockedIssues = recentIssues.filter((issue) => issue.status === "blocked");
  const activeIssues = recentIssues.filter((issue) => ["in_progress", "in_review"].includes(issue.status));
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
    setDismissedHandoffId(null);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  const latestHandoff = useMemo<HandoffSummary | null>(() => {
    for (const event of activity ?? []) {
      if (event.action !== "issue.updated" || event.entityType !== "issue" || !event.details) continue;
      const details = event.details as Record<string, unknown>;
      const nextAgentId = typeof details.assigneeAgentId === "string" ? details.assigneeAgentId : null;
      const nextUserId = typeof details.assigneeUserId === "string" ? details.assigneeUserId : null;
      const previous = (details._previous ?? null) as Record<string, unknown> | null;
      const prevAgentId = typeof previous?.assigneeAgentId === "string" ? previous.assigneeAgentId : null;
      const prevUserId = typeof previous?.assigneeUserId === "string" ? previous.assigneeUserId : null;
      if (!nextAgentId && !nextUserId && details.assigneeAgentId !== null && details.assigneeUserId !== null) continue;
      if (nextAgentId === prevAgentId && nextUserId === prevUserId) continue;

      const issueRef = entityNameMap.get(`issue:${event.entityId}`) ?? String(details.identifier ?? event.entityId.slice(0, 8));
      const issueTitle = entityTitleMap.get(`issue:${event.entityId}`) ?? String(details.issueTitle ?? t("dashboard.untitledIssue"));
      const actor = event.actorType === "agent"
        ? agentMap.get(event.actorId)?.name ?? t("dashboard.unknownActor")
        : t("dashboard.board");
      const assignee = nextAgentId
        ? agentMap.get(nextAgentId)?.name ?? t("dashboard.unknownActor")
        : nextUserId
          ? t("dashboard.board")
          : t("dashboard.unassigned");

      return {
        id: event.id,
        issueHref: `/issues/${issueRef}`,
        issueRef,
        issueTitle,
        actorName: actor,
        assigneeName: assignee,
        createdAt: event.createdAt,
      };
    }
    return null;
  }, [activity, agentMap, entityNameMap, entityTitleMap, t]);

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message={t("dashboard.welcome")}
          action={t("dashboard.getStarted")}
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message={t("dashboard.selectCompany")} />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              {t("dashboard.noAgents")}
            </p>
          </div>
          <button
            onClick={() =>
              openOnboarding({ initialStep: 3, companyId: selectedCompanyId! })
            }
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            {t("dashboard.createOneHere")}
          </button>
        </div>
      )}

      {latestHandoff && latestHandoff.id !== dismissedHandoffId && (
        <HandoffBar handoff={latestHandoff} onDismiss={() => setDismissedHandoffId(latestHandoff.id)} />
      )}

      <ActiveAgentsPanel companyId={selectedCompanyId!} />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard
              icon={Bot}
              value={data.agents.running}
              valueClassName="text-[var(--status-active)]"
              label={t("dashboard.runningAgents")}
              to="/agents"
              description={
                <span>{t("dashboard.runningAgentsDelta", { value: formatSignedDelta(data.agents.runningDeltaHour) })}</span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.open}
              label={t("dashboard.openIssues")}
              to="/issues"
              description={
                <span>{t("dashboard.openIssuesInProgress", { count: data.tasks.inProgress })}</span>
              }
            />
            <MetricCard
              icon={ShieldAlert}
              value={data.tasks.blocked}
              valueClassName="text-[var(--status-blocked)]"
              label={t("dashboard.blocked")}
              to="/issues"
              description={
                <span>{t("dashboard.immediateAttention")}</span>
              }
            />
            <MetricCard
              icon={CheckCircle2}
              value={data.tasks.todayDone}
              valueClassName="text-[var(--status-done)]"
              label={t("dashboard.todayDone")}
              to="/issues"
              description={
                <span>{t("dashboard.todayDoneDelta", { value: formatSignedDelta(data.tasks.todayDoneDelta) })}</span>
              }
            />
          </div>

          {blockedIssues.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-red-500/15 bg-red-500/[0.035]">
              <div className="flex items-center gap-2 border-b border-red-500/10 px-3.5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--status-blocked)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-blocked)]" aria-hidden="true" />
                {t("dashboard.blockedIssues")}
                <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold">
                  {blockedIssues.length}
                </span>
                <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-[var(--status-blocked)]/80">
                  {t("dashboard.immediateAttention")}
                </span>
              </div>
              <div className="flex flex-col gap-0 px-0 py-[2px]">
                {blockedIssues.slice(0, 4).map((issue) => (
                  <DashboardIssueRow
                    key={issue.id}
                    issue={issue}
                    assigneeName={agentName(issue.assigneeAgentId ?? null)}
                    compact
                    emphasized
                  />
                ))}
              </div>
            </div>
          )}

          {activeIssues.length > 0 && (
            <div className="min-w-0">
              <DashboardSectionTitle title={t("dashboard.activeIssues")} count={activeIssues.length} />
              <div className="flex flex-col gap-px">
                {activeIssues.slice(0, 6).map((issue) => (
                  <DashboardIssueRow
                    key={issue.id}
                    issue={issue}
                    assigneeName={agentName(issue.assigneeAgentId ?? null)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr]">
            <ChartCard title={t("dashboard.runActivity")} subtitle={t("dashboard.last7Days", { defaultValue: "최근 7일" })}>
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.issuesByStatus")}>
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.issuesByPriority")}>
              <PriorityChart issues={issues ?? []} />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="min-w-0">
              <DashboardSectionTitle title={t("dashboard.recentTasks")} />
              {recentIssues.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">{t("dashboard.noTasksYet")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-px">
                  {recentIssues.slice(0, 8).map((issue) => (
                    <DashboardIssueRow
                      key={issue.id}
                      issue={issue}
                      assigneeName={agentName(issue.assigneeAgentId ?? null)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <DashboardSectionTitle title={t("dashboard.recentActivity")} />
              {recentActivity.length > 0 ? (
                <div className="overflow-hidden rounded-[8px] border border-border bg-card divide-y divide-border">
                  {recentActivity.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      agentMap={agentMap}
                      entityNameMap={entityNameMap}
                      entityTitleMap={entityTitleMap}
                      className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
