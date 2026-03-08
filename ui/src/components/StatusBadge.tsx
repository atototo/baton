import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

const statusDotPrefix: Record<string, string> = {
  in_progress: "●",
  blocked: "⊘",
  done: "✓",
  in_review: "◈",
  cancelled: "✕",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const dot = statusDotPrefix[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        statusBadge[status] ?? statusBadgeDefault
      )}
    >
      {dot && <span aria-hidden className="text-[10px] leading-none">{dot}</span>}
      {t(`statusLabels.${status}`, { defaultValue: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })}
    </span>
  );
}
