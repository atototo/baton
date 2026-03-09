import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Issue } from "@atototo/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

const MIN_DASHBOARD_RUNS = 4;

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

interface ActiveAgentsPanelProps {
  companyId: string;
}

export function ActiveAgentsPanel({ companyId }: ActiveAgentsPanelProps) {
  const { t } = useTranslation();
  const { data: liveRuns } = useQuery({
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

  const activeCount = runs.filter(isRunActive).length;
  const attentionCount = runs.filter((run) => run.status === "failed" || run.status === "timed_out").length;

  if (runs.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-[8px] border border-border bg-card px-3.5 py-2.5">
      <span className="shrink-0 border-r border-border pr-2.5 mr-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {t("dashboard.running")}
      </span>
      {runs.map((run) => {
        const issue = run.issueId ? issueById.get(run.issueId) : undefined;
        const active = isRunActive(run);
        const blocked = run.status === "failed" || run.status === "timed_out";
        const initials = run.agentName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() ?? "")
          .join("");
        const taskLabel = issue
          ? `${issue.identifier ?? run.issueId?.slice(0, 8) ?? ""} ${issue.title ?? ""}`.trim()
          : run.issueId?.slice(0, 8) ?? "";

        return (
          <Link
            key={run.id}
            to={`/agents/${run.agentId}/runs/${run.id}`}
            className={cn(
              "flex shrink-0 items-center gap-[5px] rounded-[5px] border px-[9px] py-1 no-underline transition-all hover:border-border",
              active
                ? "border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.04)]"
                : blocked
                  ? "border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.04)]"
                  : "border-border bg-accent/30",
            )}
          >
            <span
              className={cn(
                "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold",
                active && "bg-[rgba(37,99,235,0.12)] text-[var(--status-active)]",
                blocked && "bg-[rgba(220,38,38,0.12)] text-[var(--status-blocked)]",
                !active && !blocked && "bg-[var(--bg-overlay)] text-muted-foreground",
              )}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-foreground">{run.agentName}</div>
              {taskLabel && (
                <div className="max-w-[140px] truncate text-[10px] text-muted-foreground">{taskLabel}</div>
              )}
            </div>
          </Link>
        );
      })}
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
        {activeCount} {t("dashboard.running")}
        {attentionCount > 0 && ` · ${attentionCount} ${t("dashboard.blocked")}`}
      </span>
    </div>
  );
}
