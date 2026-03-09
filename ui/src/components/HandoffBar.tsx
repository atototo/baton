import { X } from "lucide-react";
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
    <div className="flex items-center gap-2.5 rounded-[6px] border border-[rgba(37,99,235,0.12)] bg-[rgba(37,99,235,0.04)] px-3.5 py-2 text-[12px] text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground">{handoff.actorName}</span>
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">→</span>
      <span className="shrink-0 font-medium text-[var(--status-active)]">{handoff.assigneeName}</span>
      <Link to={handoff.issueHref} className="min-w-0 truncate text-foreground no-underline">
        <span className="text-[11px] text-muted-foreground">{handoff.issueRef}</span>
        {" "}
        {handoff.issueTitle}
      </Link>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(handoff.createdAt)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label={t("dashboard.dismissHandoff")}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
