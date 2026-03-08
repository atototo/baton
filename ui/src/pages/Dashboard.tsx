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
import { cn, formatCents } from "../lib/utils";
import { Bot, CircleDot, DollarSign, ShieldCheck, LayoutDashboard } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import { HandoffBar, type HandoffSummary } from "../components/HandoffBar";
import type { Agent, Issue } from "@atototo/shared";

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function DashboardIssueRow({
  issue,
  assigneeName,
  compact = false,
}: {
  issue: Issue;
  assigneeName: string | null;
  compact?: boolean;
}) {
  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      className={cn(
        "block rounded-lg border bg-card text-inherit no-underline transition-all hover:border-border/80 hover:bg-accent/30",
        issue.status === "blocked"
          ? "border-red-500/15 bg-red-500/[0.03] border-l-[3px] border-l-[var(--status-blocked)]"
          : "border-border",
        compact ? "px-3 py-2" : "px-3.5 py-2.5",
      )}
    >
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="mt-0.5 flex shrink-0 items-center gap-2">
            <PriorityIcon priority={issue.priority} />
            <StatusIcon status={issue.status} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {issue.identifier ?? issue.id.slice(0, 8)}
              </span>
              <p className="truncate text-[13px] text-foreground">{issue.title}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {assigneeName ? <Identity name={assigneeName} size="sm" /> : null}
              <StatusBadge status={issue.status} />
            </div>
          </div>
        </div>
        <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
          {timeAgo(issue.updatedAt)}
        </span>
      </div>
    </Link>
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
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label={t("dashboard.agentsEnabled")}
              to="/agents"
              description={
                <span>
                  {data.agents.running} {t("dashboard.running")}{", "}
                  {data.agents.paused} {t("dashboard.paused")}{", "}
                  {data.agents.error} {t("dashboard.errors")}
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label={t("dashboard.tasksInProgress")}
              to="/issues"
              description={
                <span>
                  {data.tasks.open} {t("dashboard.open")}{", "}
                  {data.tasks.blocked} {t("dashboard.blocked")}
                </span>
              }
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label={t("dashboard.monthSpend")}
              to="/costs"
              description={
                <span>
                  {data.costs.monthBudgetCents > 0
                    ? t("dashboard.budgetPercent", { percent: data.costs.monthUtilizationPercent, budget: formatCents(data.costs.monthBudgetCents) })
                    : t("dashboard.unlimitedBudget")}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals}
              label={t("dashboard.pendingApprovals")}
              to="/approvals"
              description={
                <span>
                  {t("dashboard.staleTasks", { count: data.staleTasks })}
                </span>
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-6">
            <div className="lg:col-span-3">
              <ChartCard title={t("dashboard.runActivity")} subtitle={t("dashboard.last14Days")}>
                <RunActivityChart runs={runs ?? []} />
              </ChartCard>
            </div>
            <div className="lg:col-span-1">
              <ChartCard title={t("dashboard.issuesByPriority")} subtitle={t("dashboard.last14Days")}>
                <PriorityChart issues={issues ?? []} />
              </ChartCard>
            </div>
            <div className="lg:col-span-1">
              <ChartCard title={t("dashboard.issuesByStatus")} subtitle={t("dashboard.last14Days")}>
                <IssueStatusChart issues={issues ?? []} />
              </ChartCard>
            </div>
            <div className="lg:col-span-1">
              <ChartCard title={t("dashboard.successRate")} subtitle={t("dashboard.last14Days")}>
                <SuccessRateChart runs={runs ?? []} />
              </ChartCard>
            </div>
          </div>

          {blockedIssues.length > 0 && (
            <div>
              <h3 className="section-title mb-2.5">
                {t("dashboard.blockedIssues")}
              </h3>
              <div className="grid gap-2">
                {blockedIssues.slice(0, 4).map((issue) => (
                  <DashboardIssueRow
                    key={issue.id}
                    issue={issue}
                    assigneeName={agentName(issue.assigneeAgentId ?? null)}
                    compact
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              {activeIssues.length > 0 && (
                <div className="min-w-0">
                  <h3 className="section-title mb-2.5">
                    {t("dashboard.activeIssues")}
                  </h3>
                  <div className="grid gap-2">
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

              <div className="min-w-0">
                <h3 className="section-title mb-2.5">
                  {t("dashboard.recentTasks")}
                </h3>
                {recentIssues.length === 0 ? (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{t("dashboard.noTasksYet")}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 rounded-xl border border-border bg-card p-1.5">
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
            </div>

            {recentActivity.length > 0 && (
              <div className="min-w-0">
                <h3 className="section-title mb-2.5">
                  {t("dashboard.recentActivity")}
                </h3>
                <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
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
              </div>
            )}
          </div>

        </>
      )}
    </div>
  );
}
