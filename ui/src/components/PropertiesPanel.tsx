import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Activity, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "@atototo/shared";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { ActivityRow } from "./ActivityRow";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "../lib/utils";

export function PropertiesPanel() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { panelContent, panelVisible } = usePanel();

  const {
    data: activity,
    isPending: activityPending,
    isError: activityError,
  } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
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

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents ?? []) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues ?? []) {
      map.set(`issue:${issue.id}`, issue.identifier ?? issue.id.slice(0, 8));
    }
    for (const agent of agents ?? []) {
      map.set(`agent:${agent.id}`, agent.name);
    }
    for (const project of projects ?? []) {
      map.set(`project:${project.id}`, project.name);
    }
    return map;
  }, [agents, issues, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues ?? []) {
      map.set(`issue:${issue.id}`, issue.title);
    }
    return map;
  }, [issues]);

  return (
    <aside
      className={cn(
        "hidden shrink-0 overflow-hidden border-l border-border bg-card/70 backdrop-blur-sm transition-[width,opacity] duration-200 ease-out lg:flex",
        panelVisible ? "w-[256px] opacity-100" : "w-0 border-l-0 opacity-0",
      )}
      aria-hidden={!panelVisible}
    >
      <div className="flex min-h-0 w-[256px] min-w-[256px] flex-1 flex-col">
        <div className="border-b border-border px-3 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--status-active)]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold lowercase tracking-[0.02em] text-foreground">
                {t("propertiesPanel.title")}
              </p>
              <p className="text-xs text-muted-foreground">{t("propertiesPanel.subtitle")}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">{t("propertiesPanel.latestEvents")}</p>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
            <Link to="/activity">
              <Activity className="mr-1.5 h-3.5 w-3.5" />
              {t("propertiesPanel.openActivity")}
            </Link>
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {activityPending ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("propertiesPanel.loading")}
            </div>
          ) : activityError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <p>{t("propertiesPanel.error")}</p>
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="divide-y divide-border">
              {activity.slice(0, 18).map((event) => (
                <ActivityRow
                  key={event.id}
                  event={event}
                  agentMap={agentMap}
                  entityNameMap={entityNameMap}
                  entityTitleMap={entityTitleMap}
                  className="px-3 py-2.5"
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">{t("activity.noActivityYet")}</p>
            </div>
          )}

          <div className="border-t border-border/80 bg-background/40 p-3">
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t("issueDetail.properties")}
              </p>
            </div>
            {panelContent ? (
              panelContent
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/80 px-4 py-8 text-center text-sm text-muted-foreground">
                {t("propertiesPanel.propertiesUnavailable")}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
