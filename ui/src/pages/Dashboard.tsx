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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

          {/* 활성 이슈 요약 리스트 — 목업 스타일 */}
          {recentIssues.filter((i) => ["in_progress", "blocked", "in_review"].includes(i.status)).length > 0 && (
            <div>
              <h3 className="section-title mb-2.5">
                {t("dashboard.activeIssues")}
              </h3>
              <div className="flex flex-col gap-[1px]">
                {recentIssues
                  .filter((i) => ["in_progress", "blocked", "in_review"].includes(i.status))
                  .slice(0, 6)
                  .map((issue) => {
                    const name = agentName(issue.assigneeAgentId ?? null);
                    return (
                      <Link
                        key={issue.id}
                        to={`/issues/${issue.identifier ?? issue.id}`}
                        className={cn(
                          "flex items-center gap-2.5 px-3.5 py-2.5 rounded-[6px] border bg-card text-[13px] cursor-pointer hover:border-border/80 hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)] transition-all no-underline text-inherit",
                          issue.status === "blocked"
                            ? "border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.03)] border-l-[3px] border-l-[var(--status-blocked)]"
                            : "border-border"
                        )}
                      >
                        <PriorityIcon priority={issue.priority} />
                        <span className="text-[11px] text-muted-foreground font-mono w-[60px] shrink-0">
                          {issue.identifier ?? issue.id.slice(0, 8)}
                        </span>
                        <span className="flex-1 truncate">{issue.title}</span>
                        {name && (
                          <span className="hidden sm:flex items-center gap-1 px-[7px] py-0.5 pl-[3px] rounded-[4px] bg-secondary border border-border text-[10px] text-muted-foreground shrink-0">
                            <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-[3px] bg-primary/10 text-[8px] font-bold text-primary shrink-0">
                              {name.slice(0, 2).toUpperCase()}
                            </span>
                            {name}
                          </span>
                        )}
                        <StatusBadge status={issue.status} />
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ChartCard title={t("dashboard.runActivity")} subtitle={t("dashboard.last14Days")}>
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.issuesByPriority")} subtitle={t("dashboard.last14Days")}>
              <PriorityChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.issuesByStatus")} subtitle={t("dashboard.last14Days")}>
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.successRate")} subtitle={t("dashboard.last14Days")}>
              <SuccessRateChart runs={runs ?? []} />
            </ChartCard>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="min-w-0">
                <h3 className="section-title mb-2.5">
                  {t("dashboard.recentActivity")}
                </h3>
                <div className="bg-card border border-border divide-y divide-border overflow-hidden rounded-lg">
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

            {/* Recent Tasks */}
            <div className="min-w-0">
              <h3 className="section-title mb-2.5">
                {t("dashboard.recentTasks")}
              </h3>
              {recentIssues.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">{t("dashboard.noTasksYet")}</p>
                </div>
              ) : (
                <div className="bg-card border border-border divide-y divide-border overflow-hidden rounded-lg">
                  {recentIssues.slice(0, 10).map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      className={cn(
                        "px-3.5 py-2.5 text-[13px] cursor-pointer hover:bg-accent/40 transition-colors no-underline text-inherit block",
                        issue.status === "blocked" ? "bg-[rgba(220,38,38,0.03)]" : ""
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            <PriorityIcon priority={issue.priority} />
                            <StatusIcon status={issue.status} />
                          </div>
                          <p className="min-w-0 flex-1 truncate">
                            <span>{issue.title}</span>
                            {issue.assigneeAgentId && (() => {
                              const name = agentName(issue.assigneeAgentId);
                              return name
                                ? <span className="hidden sm:inline"><Identity name={name} size="sm" className="ml-2 inline-flex" /></span>
                                : null;
                            })()}
                          </p>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5">
                          {timeAgo(issue.updatedAt)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
