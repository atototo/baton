import type { HeartbeatRun } from "@atototo/shared";
import { useTranslation } from "react-i18next";
import {
  issueStatusColorValue,
  issueStatusColorValueDefault,
  priorityColorValue,
  priorityColorValueDefault,
} from "../lib/status-colors";

/* ---- Utilities ---- */

export function getLast14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---- Sub-components ---- */

function DateLabels({ days }: { days: string[] }) {
  return (
    <div className="mt-2 flex gap-[3px]">
      {days.map((day, i) => (
        <div key={day} className="flex-1 text-center">
          {(i === 0 || i === 6 || i === 13) ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">{formatDayLabel(day)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
      {items.map(item => (
        <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
        {subtitle && <span className="text-[11px] text-muted-foreground/70">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---- Chart Components ---- */

function getLast7DayLabels(): { date: string; label: string }[] {
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 6 ? "오늘" : dayNames[d.getDay()];
    return { date: dateStr, label };
  });
}

export function RunActivityChart({ runs }: { runs: HeartbeatRun[] }) {
  const { t } = useTranslation();
  const recentDays = getLast7DayLabels();

  const grouped = new Map<string, { succeeded: number; failed: number; other: number }>();
  for (const { date } of recentDays) grouped.set(date, { succeeded: 0, failed: 0, other: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (run.status === "succeeded") entry.succeeded++;
    else if (run.status === "failed" || run.status === "timed_out") entry.failed++;
    else entry.other++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => v.succeeded + v.failed + v.other), 1);
  const hasData = Array.from(grouped.values()).some(v => v.succeeded + v.failed + v.other > 0);

  if (!hasData) return <p className="text-xs text-muted-foreground">{t("activityCharts.noRuns")}</p>;

  return (
    <div className="flex flex-col gap-[6px]">
      {recentDays.map(({ date, label }) => {
        const entry = grouped.get(date)!;
        const total = entry.succeeded + entry.failed + entry.other;
        return (
          <div key={date} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground">{label}</span>
            <div className="flex h-3 flex-1 overflow-hidden rounded-[3px] bg-[var(--bg-overlay)]">
              {entry.succeeded > 0 && (
                <div className="bg-emerald-500/70" style={{ width: `${(entry.succeeded / maxValue) * 100}%` }} />
              )}
              {entry.other > 0 && (
                <div className="bg-violet-400/60" style={{ width: `${(entry.other / maxValue) * 100}%` }} />
              )}
              {entry.failed > 0 && (
                <div className="bg-red-500/60" style={{ width: `${(entry.failed / maxValue) * 100}%` }} />
              )}
            </div>
            <span className="w-6 shrink-0 text-[10px] text-muted-foreground">{total}</span>
          </div>
        );
      })}
      <div className="mt-2.5 flex gap-3.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/70" />
          {t("activityCharts.done", { defaultValue: "완료" })}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-violet-400/75" />
          {t("activityCharts.inProgress", { defaultValue: "진행" })}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-500/60" />
          {t("activityCharts.blocked", { defaultValue: "차단" })}
        </span>
      </div>
    </div>
  );
}

const priorityColors: Record<string, string> = priorityColorValue;

const priorityOrder = ["critical", "high", "medium", "low"] as const;

export function PriorityChart({ issues }: { issues: { priority: string; createdAt: Date }[] }) {
  const { t } = useTranslation();

  const counts: Record<string, number> = {};
  for (const issue of issues) {
    counts[issue.priority] = (counts[issue.priority] ?? 0) + 1;
  }

  const visiblePriorities = priorityOrder.filter(p => (counts[p] ?? 0) > 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasData = total > 0;

  if (!hasData) return <p className="text-xs text-muted-foreground">{t("activityCharts.noIssues")}</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {visiblePriorities.map(p => {
        const count = counts[p] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const color = priorityColors[p] ?? priorityColorValueDefault;
        return (
          <div key={p}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="flex-1 text-[11px] text-secondary-foreground">{p.charAt(0).toUpperCase() + p.slice(1)}</span>
              <span className="text-[11px] font-semibold text-foreground">{count}</span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm" style={{ backgroundColor: `${color}15` }}>
              <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const statusColors: Record<string, string> = issueStatusColorValue;

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
  backlog: "Backlog",
};

export function IssueStatusChart({ issues }: { issues: { status: string; createdAt: Date }[] }) {
  const { t } = useTranslation();

  const counts: Record<string, number> = {};
  for (const issue of issues) {
    counts[issue.status] = (counts[issue.status] ?? 0) + 1;
  }

  const statusOrder = ["in_progress", "blocked", "in_review", "done", "todo", "cancelled", "backlog"].filter(s => (counts[s] ?? 0) > 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasData = total > 0;

  if (!hasData) return <p className="text-xs text-muted-foreground">{t("activityCharts.noIssues")}</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {statusOrder.map(s => {
        const count = counts[s] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const color = statusColors[s] ?? issueStatusColorValueDefault;
        return (
          <div key={s}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="flex-1 text-[11px] text-secondary-foreground">{statusLabels[s] ?? s}</span>
              <span className="text-[11px] font-semibold text-foreground">{count}</span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm" style={{ backgroundColor: `${color}15` }}>
              <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SuccessRateChart({ runs }: { runs: HeartbeatRun[] }) {
  const { t } = useTranslation();
  const days = getLast14Days();
  const grouped = new Map<string, { succeeded: number; total: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, total: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry.total++;
    if (run.status === "succeeded") entry.succeeded++;
  }

  const hasData = Array.from(grouped.values()).some(v => v.total > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">{t("activityCharts.noRuns")}</p>;

  return (
    <div>
      <div className="flex h-24 items-end gap-[3px] rounded-lg bg-[var(--bg-overlay)]/70 px-2 py-2">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const rate = entry.total > 0 ? entry.succeeded / entry.total : 0;
          const color = entry.total === 0 ? undefined : rate >= 0.8 ? "#10b981" : rate >= 0.5 ? "#eab308" : "#ef4444";
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${entry.total > 0 ? Math.round(rate * 100) : 0}% (${entry.succeeded}/${entry.total})`}>
              {entry.total > 0 ? (
                <div style={{ height: `${rate * 100}%`, minHeight: 2, backgroundColor: color }} />
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}
