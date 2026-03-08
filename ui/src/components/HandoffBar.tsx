import { ArrowRightLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { timeAgo } from "../lib/timeAgo";

export interface HandoffSummary {
  id: string;
  issueHref: string;
  issueRef: string;
  issueTitle: string;
  actorName: string;
  assigneeName: string;
  createdAt: Date | string;
}

interface HandoffBarProps {
  handoff: HandoffSummary;
  onDismiss: () => void;
}

export function HandoffBar({ handoff, onDismiss }: HandoffBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 rounded-[8px] border px-4 py-3 shadow-[0_1px_4px_rgba(37,99,235,0.08)] bg-[rgba(37,99,235,0.04)] border-[rgba(37,99,235,0.12)]">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[rgba(37,99,235,0.08)] text-[var(--status-active)]">
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--status-active)]">
          {t("dashboard.handoffLabel")}
        </p>
        <p className="mt-1 text-sm text-foreground">
          {t("dashboard.handoffMessage", {
            actor: handoff.actorName,
            assignee: handoff.assigneeName,
          })}
          {" · "}
          <Link to={handoff.issueHref} className="font-medium underline decoration-[rgba(37,99,235,0.28)] underline-offset-2">
            {handoff.issueRef}
          </Link>
          <span className="text-muted-foreground"> — {handoff.issueTitle}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{timeAgo(handoff.createdAt)}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label={t("dashboard.dismissHandoff")}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
