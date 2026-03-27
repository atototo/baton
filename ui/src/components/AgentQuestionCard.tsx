import { useState } from "react";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { Link } from "@/lib/router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Identity } from "./Identity";
import { AgentQuestionPayload } from "./ApprovalPayload";
import { timeAgo } from "../lib/timeAgo";
import type { Approval, Agent } from "@atototo/shared";

export function AgentQuestionCard({
  approval,
  requesterAgent,
  onAnswer,
  onDismiss,
  detailLink,
  isPending,
}: {
  approval: Approval;
  requesterAgent: Agent | null;
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
  detailLink?: string;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [textAnswer, setTextAnswer] = useState("");

  const question = String(approval.payload.question ?? "");
  const options = Array.isArray(approval.payload.options)
    ? approval.payload.options.map(String)
    : null;
  const isActionable =
    approval.status === "pending" || approval.status === "revision_requested";
  const isAnswered = approval.status === "approved";

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-card px-4 py-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 shrink-0 text-indigo-400" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {t("approval.typeAgentQuestion")}
              </span>
              <span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-indigo-400">
                {isAnswered
                  ? t("approval.questionAnswered")
                  : approval.status.replace("_", " ")}
              </span>
            </div>
            {requesterAgent && (
              <span className="mt-0.5 inline-flex text-xs text-muted-foreground">
                {t("approval.requestedBy")}{" "}
                <Identity
                  name={requesterAgent.name}
                  size="sm"
                  className="inline-flex"
                />
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {timeAgo(approval.createdAt)}
        </span>
      </div>

      {/* Question */}
      <div className="mt-3">
        <p className="text-base font-medium text-foreground">{question}</p>
        {typeof approval.payload.context === "string" && (
          <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
            {approval.payload.context}
          </div>
        )}
      </div>

      {/* Answer area */}
      {isActionable && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          {/* Option buttons */}
          {options && options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((opt, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  className="h-8 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-200"
                  onClick={() => onAnswer(opt)}
                  disabled={isPending}
                >
                  {opt}
                </Button>
              ))}
            </div>
          )}

          {/* Text input (always show as fallback) */}
          <div className="flex gap-2">
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textAnswer.trim()) {
                  onAnswer(textAnswer.trim());
                  setTextAnswer("");
                }
              }}
              placeholder={t("approval.questionPlaceholder")}
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              disabled={isPending}
            />
            <Button
              size="sm"
              className="h-8 bg-indigo-600 px-3 text-white hover:bg-indigo-500"
              onClick={() => {
                if (textAnswer.trim()) {
                  onAnswer(textAnswer.trim());
                  setTextAnswer("");
                }
              }}
              disabled={isPending || !textAnswer.trim()}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              {t("approval.questionSend")}
            </Button>
          </div>

          {/* Dismiss */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={onDismiss}
              disabled={isPending}
            >
              <X className="h-3 w-3 mr-1" />
              {t("approval.questionDismiss")}
            </Button>
          </div>
        </div>
      )}

      {/* Answered state */}
      {isAnswered && approval.decisionNote && (
        <div className="mt-3 rounded-md border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-sm">
          <span className="text-xs text-indigo-400 font-medium">
            {t("approval.questionAnswer")}:
          </span>{" "}
          <span className="text-foreground">{approval.decisionNote}</span>
        </div>
      )}

      {/* Detail link */}
      <div className="mt-2">
        {detailLink && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-0 text-xs"
            asChild
          >
            <Link to={detailLink}>{t("approval.viewDetails")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
