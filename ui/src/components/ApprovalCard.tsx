import { useState } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
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
  onForceApprove,
  onDismissError,
  onReject,
  onRequestRevision,
  onOpen,
  detailLink,
  isPending,
  approveError,
}: {
  approval: Approval;
  requesterAgent: Agent | null;
  onApprove: () => void;
  onForceApprove?: () => void;
  onDismissError?: () => void;
  onReject: (note?: string) => void;
  onRequestRevision?: (note?: string) => void;
  onOpen?: () => void;
  detailLink?: string;
  isPending: boolean;
  approveError?: string | null;
}) {
  const { t } = useTranslation();
  const [showNoteFor, setShowNoteFor] = useState<"reject" | "revision" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const labels = useTypeLabel();
  const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
  const label = labels[approval.type] ?? approval.type;
  const isUncommittedError = approveError && (approveError.includes("uncommitted changes") || approveError.includes("clean source"));

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      {/* Uncommitted changes warning — force approve directly */}
      {isUncommittedError && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-200">{approveError}</p>
              <p className="mt-1 text-xs text-amber-200/70">{t("approval.forceApproveDescription")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 bg-amber-600 px-3 text-xs text-white hover:bg-amber-500"
              onClick={() => onForceApprove?.()}
              disabled={isPending}
            >
              {t("approval.forceApprove")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onDismissError?.()}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

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
            onClick={() => {
              if (showNoteFor === "reject") {
                onReject(decisionNote.trim() || undefined);
                setShowNoteFor(null);
                setDecisionNote("");
              } else {
                setShowNoteFor("reject");
                setDecisionNote("");
              }
            }}
            disabled={isPending}
          >
            {t("approval.reject")}
          </Button>
          {approval.status === "pending" && onRequestRevision && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={() => {
                if (showNoteFor === "revision") {
                  onRequestRevision(decisionNote.trim() || undefined);
                  setShowNoteFor(null);
                  setDecisionNote("");
                } else {
                  setShowNoteFor("revision");
                  setDecisionNote("");
                }
              }}
              disabled={isPending}
            >
              {t("approval.requestRevision")}
            </Button>
          )}
        </div>
      )}
      {showNoteFor && (
        <div className="mt-3 flex gap-2 items-start border-t border-border pt-3">
          <textarea
            className="flex-1 min-h-[60px] rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={showNoteFor === "reject" ? "거절 사유를 입력하세요..." : "수정 요청 사유를 입력하세요..."}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant={showNoteFor === "reject" ? "destructive" : "outline"}
              onClick={() => {
                if (showNoteFor === "reject") {
                  onReject(decisionNote.trim() || undefined);
                } else {
                  onRequestRevision?.(decisionNote.trim() || undefined);
                }
                setShowNoteFor(null);
                setDecisionNote("");
              }}
              disabled={isPending}
            >
              {showNoteFor === "reject" ? t("approval.reject") : t("approval.requestRevision")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowNoteFor(null);
                setDecisionNote("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
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
