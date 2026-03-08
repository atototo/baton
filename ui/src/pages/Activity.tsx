import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History } from "lucide-react";
import type { Agent } from "@atototo/shared";

type ActivityEntityFilter = "all" | string;
type ActivityActorFilter = "all" | "agent" | "user" | "system";

export function Activity() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState<ActivityEntityFilter>("all");
  const [actorFilter, setActorFilter] = useState<ActivityActorFilter>("all");

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.activity") }]);
  }, [setBreadcrumbs, t]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
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

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

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
    for (const g of goals ?? []) map.set(`goal:${g.id}`, g.title);
    return map;
  }, [issues, agents, projects, goals]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message={t("activity.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered = data?.filter((event) => {
    if (filter !== "all" && event.entityType !== filter) return false;
    if (actorFilter !== "all" && event.actorType !== actorFilter) return false;
    return true;
  });

  const entityTypes = data
    ? [...new Set(data.map((e) => e.entityType))].sort()
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {t("activity.overview")}
            </p>
            <h2 className="text-lg font-semibold">{t("nav.activity")}</h2>
            <p className="text-sm text-muted-foreground">{t("activity.summary")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={(value) => setFilter(value as ActivityEntityFilter)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder={t("activity.filterByType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("activity.allTypes")}</SelectItem>
                {entityTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={actorFilter}
              onValueChange={(value) => setActorFilter(value as ActivityActorFilter)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder={t("activity.actorType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("activity.allActors")}</SelectItem>
                <SelectItem value="agent">{t("activity.actors.agent")}</SelectItem>
                <SelectItem value="user">{t("activity.actors.user")}</SelectItem>
                <SelectItem value="system">{t("activity.actors.system")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {t("activity.metrics.total")}
            </p>
            <p className="mt-1 text-base font-semibold">{data?.length ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {t("activity.metrics.visible")}
            </p>
            <p className="mt-1 text-base font-semibold">{filtered?.length ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {t("activity.metrics.types")}
            </p>
            <p className="mt-1 text-base font-semibold">{entityTypes.length}</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {filtered && filtered.length === 0 && (
        <EmptyState icon={History} message={t("activity.noActivityYet")} />
      )}

      {filtered && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
          {filtered.map((event) => (
            <ActivityRow
              key={event.id}
              event={event}
              agentMap={agentMap}
              entityNameMap={entityNameMap}
              entityTitleMap={entityTitleMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
