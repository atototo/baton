import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { useTranslation } from "react-i18next";
import { useTypeLabel, typeIcon, defaultTypeIcon, ApprovalPayloadRenderer } from "../components/ApprovalPayload";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import type { ApprovalComment } from "@atototo/shared";
import { MarkdownBody } from "../components/MarkdownBody";

export function ApprovalDetail() {
  const { t } = useTranslation();
  const typeLabels = useTypeLabel();
  const { approvalId } = useParams<{ approvalId: string }>();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);

  const { data: approval, isLoading } = useQuery({
    queryKey: queryKeys.approvals.detail(approvalId!),
    queryFn: () => approvalsApi.get(approvalId!),
    enabled: !!approvalId,
  });
  const resolvedCompanyId = approval?.companyId ?? selectedCompanyId;

  const { data: comments } = useQuery({
    queryKey: queryKeys.approvals.comments(approvalId!),
    queryFn: () => approvalsApi.listComments(approvalId!),
    enabled: !!approvalId,
  });

  const { data: linkedIssues } = useQuery({
    queryKey: queryKeys.approvals.issues(approvalId!),
    queryFn: () => approvalsApi.listIssues(approvalId!),
    enabled: !!approvalId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId ?? ""),
    queryFn: () => agentsApi.list(resolvedCompanyId ?? ""),
    enabled: !!resolvedCompanyId,
  });

  useEffect(() => {
    if (!approval?.companyId || approval.companyId === selectedCompanyId) return;
    setSelectedCompanyId(approval.companyId, { source: "route_sync" });
  }, [approval?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("approval.approvals"), href: "/approvals" },
      { label: approval?.id?.slice(0, 8) ?? approvalId ?? t("approval.approvals") },
    ]);
  }, [setBreadcrumbs, approval, approvalId]);

  const refresh = () => {
    if (!approvalId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.detail(approvalId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.comments(approvalId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.issues(approvalId) });
    if (approval?.companyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(approval.companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.list(approval.companyId, "pending"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(approval.companyId) });
    }
  };

  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: (force?: boolean) => approvalsApi.approve(approvalId!, undefined, force),
    onSuccess: () => {
      setError(null);
      setShowForceConfirm(false);
      setForceError(null);
      refresh();
      navigate(`/approvals/${approvalId}?resolved=approved`, { replace: true });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("approval.failedToApprove");
      if (msg.includes("uncommitted changes") || msg.includes("clean source")) {
        setForceError(msg);
        setShowForceConfirm(true);
      } else {
        setError(msg);
      }
    },
  });

  const [decisionNote, setDecisionNote] = useState("");
  const [showNoteFor, setShowNoteFor] = useState<"reject" | "revision" | null>(null);

  const rejectMutation = useMutation({
    mutationFn: () => approvalsApi.reject(approvalId!, decisionNote || undefined),
    onSuccess: () => {
      setError(null);
      setDecisionNote("");
      setShowNoteFor(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t("approval.failedToReject")),
  });

  const revisionMutation = useMutation({
    mutationFn: () => approvalsApi.requestRevision(approvalId!, decisionNote || undefined),
    onSuccess: () => {
      setError(null);
      setDecisionNote("");
      setShowNoteFor(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t("approval.failedToRequestRevision")),
  });

  const resubmitMutation = useMutation({
    mutationFn: () => approvalsApi.resubmit(approvalId!),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t("approval.failedToResubmit")),
  });

  const addCommentMutation = useMutation({
    mutationFn: () => approvalsApi.addComment(approvalId!, commentBody.trim()),
    onSuccess: () => {
      setCommentBody("");
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t("approval.failedToComment")),
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.remove(agentId),
    onSuccess: () => {
      setError(null);
      refresh();
      navigate("/approvals");
    },
    onError: (err) => setError(err instanceof Error ? err.message : t("approval.failedToDeleteAgent")),
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (!approval) return <p className="text-sm text-muted-foreground">{t("approval.notFound")}</p>;

  const payload = approval.payload as Record<string, unknown>;
  const linkedAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
  const isActionable = approval.status === "pending" || approval.status === "revision_requested";
  const TypeIcon = typeIcon[approval.type] ?? defaultTypeIcon;
  const showApprovedBanner = searchParams.get("resolved") === "approved" && approval.status === "approved";
  const primaryLinkedIssue = linkedIssues?.[0] ?? null;
  const resolvedCta =
    primaryLinkedIssue
      ? {
          label:
            (linkedIssues?.length ?? 0) > 1
              ? t("approval.reviewLinkedIssues")
              : t("approval.reviewLinkedIssue"),
          to: `/issues/${primaryLinkedIssue.identifier ?? primaryLinkedIssue.id}`,
        }
      : linkedAgentId
        ? {
            label: t("approval.openHiredAgent"),
            to: `/agents/${linkedAgentId}`,
          }
        : {
            label: t("approval.backToApprovals"),
            to: "/approvals",
          };

  return (
    <div className="space-y-6 max-w-3xl">
      {showApprovedBanner && (
        <div className="border border-green-300 dark:border-green-700/40 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <div className="relative mt-0.5">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-300" />
                <Sparkles className="h-3 w-3 text-green-500 dark:text-green-200 absolute -right-2 -top-1 animate-pulse" />
              </div>
              <div>
                <p className="text-sm text-green-800 dark:text-green-100 font-medium">{t("approval.confirmed")}</p>
                <p className="text-xs text-green-700 dark:text-green-200/90">
                  {t("approval.confirmedDesc")}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-green-400 dark:border-green-600/50 text-green-800 dark:text-green-100 hover:bg-green-100 dark:hover:bg-green-900/30"
              onClick={() => navigate(resolvedCta.to)}
            >
              {resolvedCta.label}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <h2 className="text-lg font-semibold">{typeLabels[approval.type] ?? approval.type.replace(/_/g, " ")}</h2>
              <p className="text-xs text-muted-foreground font-mono">{approval.id}</p>
            </div>
          </div>
          <StatusBadge status={approval.status} />
        </div>
        <div className="text-sm space-y-1">
          {approval.requestedByAgentId && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">{t("approval.requestedBy")}</span>
              <Identity
                name={agentNameById.get(approval.requestedByAgentId) ?? approval.requestedByAgentId.slice(0, 8)}
                size="sm"
              />
            </div>
          )}
          <ApprovalPayloadRenderer type={approval.type} payload={payload} />
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            onClick={() => setShowRawPayload((v) => !v)}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showRawPayload ? "rotate-90" : ""}`} />
            {t("approval.seeFullRequest")}
          </button>
          {showRawPayload && (
            <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-x-auto">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
          {approval.decisionNote && (
            <p className="text-xs text-muted-foreground">{t("approval.decisionNote")} {approval.decisionNote}</p>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {linkedIssues && linkedIssues.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <p className="text-xs text-muted-foreground mb-1.5">{t("approval.linkedIssues")}</p>
            <div className="space-y-1.5">
              {linkedIssues.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="block text-xs rounded border border-border/70 px-2 py-1.5 hover:bg-accent/20"
                >
                  <span className="font-mono text-muted-foreground mr-2">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  <span>{issue.title}</span>
                </Link>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {t("approval.linkedIssuesNote")}
            </p>
          </div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {isActionable && (
              <>
                <Button
                  size="sm"
                  className="bg-green-700 hover:bg-green-600 text-white"
                  onClick={() => approveMutation.mutate(false)}
                  disabled={approveMutation.isPending}
                >
                  {t("approval.approve")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (showNoteFor === "reject") {
                      rejectMutation.mutate();
                    } else {
                      setShowNoteFor("reject");
                      setDecisionNote("");
                    }
                  }}
                  disabled={rejectMutation.isPending}
                >
                  {t("approval.reject")}
                </Button>
              </>
            )}
            {approval.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (showNoteFor === "revision") {
                    revisionMutation.mutate();
                  } else {
                    setShowNoteFor("revision");
                    setDecisionNote("");
                  }
                }}
                disabled={revisionMutation.isPending}
              >
                {t("approval.requestRevision")}
              </Button>
            )}
          </div>
          {showNoteFor && (
            <div className="flex gap-2 items-start">
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
                  onClick={() => showNoteFor === "reject" ? rejectMutation.mutate() : revisionMutation.mutate()}
                  disabled={rejectMutation.isPending || revisionMutation.isPending}
                >
                  {showNoteFor === "reject" ? t("approval.reject") : t("approval.requestRevision")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowNoteFor(null); setDecisionNote(""); }}
                >
                  취소
                </Button>
              </div>
            </div>
          )}
          {approval.status === "revision_requested" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => resubmitMutation.mutate()}
              disabled={resubmitMutation.isPending}
            >
              {t("approval.markResubmitted")}
            </Button>
          )}
          {approval.status === "rejected" && approval.type === "hire_agent" && linkedAgentId && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/40"
              onClick={() => {
                if (!window.confirm(t("approval.deleteConfirm"))) return;
                deleteAgentMutation.mutate(linkedAgentId);
              }}
              disabled={deleteAgentMutation.isPending}
            >
              {t("approval.deleteAgent")}
            </Button>
          )}
        </div>
        {showForceConfirm && (
          <div className="border border-yellow-500/40 bg-yellow-500/10 rounded-md p-3 space-y-2">
            <p className="text-sm text-yellow-200">{forceError}</p>
            <p className="text-xs text-muted-foreground">
              {t("approval.forceApproveDescription")}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-yellow-600 hover:bg-yellow-500 text-white"
                onClick={() => approveMutation.mutate(true)}
                disabled={approveMutation.isPending}
              >
                {t("approval.forceApprove")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowForceConfirm(false); setForceError(null); }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium">{t("approval.comments")} ({comments?.length ?? 0})</h3>
        <div className="space-y-2">
          {(comments ?? []).map((comment: ApprovalComment) => (
            <div key={comment.id} className="border border-border/60 rounded-md p-3">
              <div className="flex items-center justify-between mb-1">
                {comment.authorAgentId ? (
                  <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline">
                    <Identity
                      name={agentNameById.get(comment.authorAgentId) ?? comment.authorAgentId.slice(0, 8)}
                      size="sm"
                    />
                  </Link>
                ) : (
                  <Identity name={t("approval.board")} size="sm" />
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <MarkdownBody className="text-sm">{comment.body}</MarkdownBody>
            </div>
          ))}
        </div>
        <Textarea
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder={t("approval.addComment")}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => addCommentMutation.mutate()}
            disabled={!commentBody.trim() || addCommentMutation.isPending}
          >
            {addCommentMutation.isPending ? t("approval.posting") : t("approval.postComment")}
          </Button>
        </div>
      </div>
    </div>
  );
}
