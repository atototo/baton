import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalTree } from "../components/GoalTree";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Target, Plus } from "lucide-react";

function GoalSummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function Goals() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.goals") }]);
  }, [setBreadcrumbs, t]);

  const { data: goals, isLoading, error } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Target} message={t("goals.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const totalGoals = goals?.length ?? 0;
  const topLevelGoals = goals?.filter((goal) => !goal.parentId).length ?? 0;
  const activeGoals =
    goals?.filter((goal) => goal.status === "active" || goal.status === "planned").length ?? 0;
  const completedGoals = goals?.filter((goal) => goal.status === "achieved").length ?? 0;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {goals && goals.length === 0 && (
        <EmptyState
          icon={Target}
          message={t("goals.noGoals")}
          action={t("goals.addGoal")}
          onAction={() => openNewGoal()}
        />
      )}

      {goals && goals.length > 0 && (
        <>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t("goals.overview")}
                </p>
                <h2 className="text-lg font-semibold">{t("goals.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("goals.summary")}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => openNewGoal()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("goals.newGoal")}
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <GoalSummaryCard label={t("goals.metrics.total")} value={String(totalGoals)} />
              <GoalSummaryCard label={t("goals.metrics.topLevel")} value={String(topLevelGoals)} />
              <GoalSummaryCard label={t("goals.metrics.active")} value={String(activeGoals)} />
              <GoalSummaryCard
                label={t("goals.metrics.completed")}
                value={String(completedGoals)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {t("goals.structure")}
              </p>
              <p className="text-xs text-muted-foreground">{t("goals.treeHint")}</p>
            </div>
            <GoalTree goals={goals} goalLink={(goal) => `/goals/${goal.id}`} />
          </div>
        </>
      )}
    </div>
  );
}
