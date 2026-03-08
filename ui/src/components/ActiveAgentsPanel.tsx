import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Issue } from "@atototo/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import { Identity } from "./Identity";

const MIN_DASHBOARD_RUNS = 4;

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

interface ActiveAgentsPanelProps {
  companyId: string;
}

export function ActiveAgentsPanel({ companyId }: ActiveAgentsPanelProps) {
  const { t } = useTranslation();
  const {
    data: liveRuns,
    isPending,
    isError,
  } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "dashboard"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, MIN_DASHBOARD_RUNS),
  });

  const runs = liveRuns ?? [];
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: runs.length > 0,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issues]);

  return (
    <div>
      <h3 className="section-title mb-2.5">
        {t("dashboard.activeRuns")}
      </h3>
      {isPending ? (
        <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
          {t("propertiesPanel.loading")}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          {t("propertiesPanel.error")}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <p className="text-sm text-muted-foreground">{t("liveRuns.noRecentRuns")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {runs.map((run) => (
            <RunStatusPill
              key={run.id}
              run={run}
              issue={run.issueId ? issueById.get(run.issueId) : undefined}
              isActive={isRunActive(run)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RunStatusPill({
  run,
  issue,
  isActive,
}: {
  run: LiveRunForIssue;
  issue?: Issue;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const statusTone = isActive
    ? "border-blue-500/25 bg-blue-500/8"
    : run.status === "failed" || run.status === "timed_out"
      ? "border-red-500/25 bg-red-500/8"
      : "border-border bg-card";
  const issueLabel = issue?.identifier ?? (run.issueId ? run.issueId.slice(0, 8) : null);

  return (
    <Link
      to={`/agents/${run.agentId}/runs/${run.id}`}
      className={cn(
        "flex min-w-[220px] max-w-full items-center gap-3 rounded-xl border px-3 py-2.5 no-underline transition-colors hover:bg-accent/40",
        statusTone,
      )}
      aria-label={`${run.agentName} ${run.status}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Identity name={run.agentName} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{run.agentName}</span>
            <span
              className={cn(
                "inline-flex h-2 w-2 shrink-0 rounded-full",
                isActive
                  ? "bg-blue-500"
                  : run.status === "failed" || run.status === "timed_out"
                    ? "bg-red-500"
                    : "bg-muted-foreground/40",
              )}
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {issueLabel ? <span className="truncate font-mono">{issueLabel}</span> : null}
            <span>{relativeTime(run.finishedAt ?? run.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={cn(
            "inline-flex rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
            isActive
              ? "bg-blue-500/12 text-blue-700 dark:text-blue-300"
              : run.status === "failed" || run.status === "timed_out"
                ? "bg-red-500/12 text-red-700 dark:text-red-300"
                : "bg-secondary text-secondary-foreground",
          )}
        >
          {isActive ? t("agentDetail.live") : run.status}
        </span>
      </div>
    </Link>
  );
}
