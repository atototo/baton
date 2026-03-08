import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { costsApi } from "../api/costs";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, formatTokens } from "../lib/utils";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";

type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all" | "custom";

function computeRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (preset) {
    case "mtd": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "7d": {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "30d": {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "ytd": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    case "all":
      return { from: "", to: "" };
    case "custom":
      return { from: "", to: "" };
  }
}

export function Costs() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.costs") }]);
  }, [setBreadcrumbs, t]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : "",
        to: customTo ? new Date(customTo + "T23:59:59.999Z").toISOString() : "",
      };
    }
    return computeRange(preset);
  }, [preset, customFrom, customTo]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!, from || undefined, to || undefined),
    queryFn: async () => {
      const [summary, byAgent, byProject] = await Promise.all([
        costsApi.summary(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byAgent(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byProject(selectedCompanyId!, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject };
    },
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message={t("costs.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="costs" />;
  }

  const topProjectSpend = Math.max(...(data?.byProject.map((row) => row.costCents) ?? [0]), 0);
  const totalProjectSpend = data?.byProject.reduce((sum, row) => sum + row.costCents, 0) ?? 0;
  const topAgentSpend = Math.max(...(data?.byAgent.map((row) => row.costCents) ?? [0]), 0);

  const presetKeys: DatePreset[] = ["mtd", "7d", "30d", "ytd", "all", "custom"];
  const presetLabels: Record<DatePreset, string> = {
    mtd: t("costs.presets.mtd"),
    "7d": t("costs.presets.7d"),
    "30d": t("costs.presets.30d"),
    ytd: t("costs.presets.ytd"),
    all: t("costs.presets.all"),
    custom: t("costs.presets.custom"),
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {t("costs.overview")}
            </p>
            <h2 className="text-lg font-semibold">{t("nav.costs")}</h2>
            <p className="text-sm text-muted-foreground">{t("costs.summary")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {presetKeys.map((p) => (
              <Button
                key={p}
                variant={preset === p ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setPreset(p)}
              >
                {presetLabels[p]}
              </Button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label={t("costs.customFrom")}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">{t("costs.to")}</span>
            <input
              type="date"
              aria-label={t("costs.customTo")}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{presetLabels[preset]}</p>
                {data.summary.budgetCents > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("costs.utilizedPercent", { percent: data.summary.utilizationPercent })}
                  </p>
                )}
              </div>
              <p className="text-2xl font-bold">
                {formatCents(data.summary.spendCents)}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  {data.summary.budgetCents > 0
                    ? `/ ${formatCents(data.summary.budgetCents)}`
                    : t("dashboard.unlimitedBudget")}
                </span>
              </p>
              {data.summary.budgetCents > 0 ? (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-[width,background-color] duration-150 ${
                        data.summary.utilizationPercent > 90
                          ? "bg-red-400"
                          : data.summary.utilizationPercent > 70
                            ? "bg-yellow-400"
                            : "bg-green-400"
                      }`}
                      style={{ width: `${Math.min(100, data.summary.utilizationPercent)}%` }}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {t("costs.metrics.agentCount")}
                      </p>
                      <p className="mt-1 text-base font-semibold">{data.byAgent.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {t("costs.metrics.projectCount")}
                      </p>
                      <p className="mt-1 text-base font-semibold">{data.byProject.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {t("costs.metrics.tokenVolume")}
                      </p>
                      <p className="mt-1 text-base font-semibold">
                        {formatTokens(
                          data.byAgent.reduce(
                            (sum, row) => sum + row.inputTokens + row.outputTokens,
                            0,
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* By Agent / By Project */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">{t("costs.byAgent")}</h3>
                {data.byAgent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("costs.noCostEvents")}</p>
                ) : (
                  <div className="space-y-2">
                    {data.byAgent.map((row) => (
                      <div
                        key={row.agentId}
                        className="rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Identity
                                name={row.agentName ?? row.agentId}
                                size="sm"
                              />
                              {row.agentStatus === "terminated" && (
                                <StatusBadge status="terminated" />
                              )}
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-[var(--primary)]"
                                style={{
                                  width: `${topAgentSpend > 0 ? (row.costCents / topAgentSpend) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="ml-2 shrink-0 text-right">
                            <span className="block font-medium">{formatCents(row.costCents)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t("costs.shareOfSpend", {
                                percent:
                                  data.summary.spendCents > 0
                                    ? Math.round((row.costCents / data.summary.spendCents) * 100)
                                    : 0,
                              })}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              in {formatTokens(row.inputTokens)} / out {formatTokens(row.outputTokens)} tok
                            </span>
                            {(row.apiRunCount > 0 || row.subscriptionRunCount > 0) && (
                              <span className="block text-xs text-muted-foreground">
                                {row.apiRunCount > 0 ? `api runs: ${row.apiRunCount}` : null}
                                {row.apiRunCount > 0 && row.subscriptionRunCount > 0 ? " | " : null}
                                {row.subscriptionRunCount > 0
                                  ? `subscription runs: ${row.subscriptionRunCount} (${formatTokens(row.subscriptionInputTokens)} in / ${formatTokens(row.subscriptionOutputTokens)} out tok)`
                                  : null}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">{t("costs.byProject")}</h3>
                {data.byProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("costs.noProjectCosts")}</p>
                ) : (
                  <div className="space-y-2">
                    {data.byProject.map((row) => (
                      <div
                        key={row.projectId ?? "na"}
                        className="rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm"
                      >
                        <div className="w-full space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate">
                              {row.projectName ?? row.projectId ?? "Unattributed"}
                            </span>
                            <span className="font-medium">{formatCents(row.costCents)}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[var(--status-active)]"
                              style={{
                                width: `${topProjectSpend > 0 ? (row.costCents / topProjectSpend) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatTokens(row.inputTokens + row.outputTokens)} tok</span>
                            <span>
                              {t("costs.shareOfSpend", {
                                percent:
                                  totalProjectSpend > 0
                                    ? Math.round((row.costCents / totalProjectSpend) * 100)
                                    : 0,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
