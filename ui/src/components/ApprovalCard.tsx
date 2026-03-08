import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { Link } from "@/lib/router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Identity } from "./Identity";
import { useTypeLabel, typeIcon, defaultTypeIcon, ApprovalPayloadRenderer } from "./ApprovalPayload";
import { timeAgo } from "../lib/timeAgo";
import type { Approval, Agent } from "@atototo/shared";

function statusIcon(status: string) {
  if (status === "approved") return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-done)]" />;
  if (status === "rejected") return <XCircle className="h-3.5 w-3.5 text-[var(--status-blocked)]" />;
  if (status === "revision_requested") return <Clock className="h-3.5 w-3.5 text-[var(--priority-high)]" />;
  if (status === "pending") return <Clock className="h-3.5 w-3.5 text-[var(--priority-medium)]" />;
  return null;
}

export function ApprovalCard({
  approval,
  requesterAgent,
  onApprove,
  onReject,
  onOpen,
  detailLink,
  isPending,
}: {
  approval: Approval;
  requesterAgent: Agent | null;
  onApprove: () => void;
  onReject: () => void;
  onOpen?: () => void;
  detailLink?: string;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const labels = useTypeLabel();
  const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
  const label = labels[approval.type] ?? approval.type;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{label}</span>
              <span className="rounded-full bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {approval.status.replace("_", " ")}
              </span>
            </div>
            {requesterAgent && (
              <span className="mt-0.5 inline-flex text-xs text-muted-foreground">
                {t("approval.requestedBy")} <Identity name={requesterAgent.name} size="sm" className="inline-flex" />
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {statusIcon(approval.status)}
          <span className="text-xs text-muted-foreground">{timeAgo(approval.createdAt)}</span>
        </div>
      </div>

      {/* Payload */}
      <div className="mt-3">
        <ApprovalPayloadRenderer type={approval.type} payload={approval.payload} />
      </div>

      {/* Decision note */}
      {approval.decisionNote && (
        <div className="mt-3 border-t border-border pt-2 text-xs italic text-muted-foreground">
          {t("approval.note")} {approval.decisionNote}
        </div>
      )}

      {/* Actions */}
      {(approval.status === "pending" || approval.status === "revision_requested") && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            className="h-8 bg-[var(--status-done)] px-3 text-white hover:opacity-90"
            onClick={onApprove}
            disabled={isPending}
          >
            {t("approval.approve")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-3"
            onClick={onReject}
            disabled={isPending}
          >
            {t("approval.reject")}
          </Button>
        </div>
      )}
      <div className="mt-2">
        {detailLink ? (
          <Button variant="ghost" size="sm" className="h-7 px-0 text-xs" asChild>
            <Link to={detailLink}>{t("approval.viewDetails")}</Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 px-0 text-xs" onClick={onOpen}>
            {t("approval.viewDetails")}
          </Button>
        )}
      </div>
    </div>
  );
}
