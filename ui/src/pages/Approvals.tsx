import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { ApprovalCard } from "../components/ApprovalCard";
import { AgentQuestionCard } from "../components/AgentQuestionCard";
import { PageSkeleton } from "../components/PageSkeleton";

type StatusFilter = "pending" | "all";

export function Approvals() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const pathSegment = location.pathname.split("/").pop() ?? "pending";
  const statusFilter: StatusFilter = pathSegment === "all" ? "all" : "pending";
  const [actionError, setActionError] = useState<string | null>(null);
  const [approveErrorMap, setApproveErrorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setBreadcrumbs([{ label: t("approval.approvals") }]);
  }, [setBreadcrumbs, t]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, force, decisionNote }: { id: string; force?: boolean; decisionNote?: string }) => approvalsApi.approve(id, decisionNote, force),
    onSuccess: (_approval, { id }) => {
      setActionError(null);
      setApproveErrorMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err, { id }) => {
      const msg = err instanceof Error ? err.message : t("inbox.failedToApprove");
      if (msg.includes("uncommitted changes") || msg.includes("clean source")) {
        setApproveErrorMap((prev) => ({ ...prev, [id]: msg }));
      } else {
        setActionError(msg);
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approvalsApi.reject(id, note),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : t("inbox.failedToReject"));
    },
  });

  const requestRevisionMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approvalsApi.requestRevision(id, note),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : t("approval.failedToRequestRevision"));
    },
  });

  const filtered = (data ?? [])
    .filter(
      (a) => statusFilter === "all" || a.status === "pending" || a.status === "revision_requested",
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingCount = (data ?? []).filter(
    (a) => a.status === "pending" || a.status === "revision_requested",
  ).length;

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">{t("approval.selectCompany")}</p>;
  }

  if (isLoading) {
    return <PageSkeleton variant="approvals" />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {t("approval.overview")}
            </p>
            <h2 className="text-lg font-semibold">{t("approval.approvals")}</h2>
            <p className="text-sm text-muted-foreground">{t("approval.summary")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
            <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {t("approval.pending")}
              </p>
              <p className="mt-1 text-lg font-semibold">{pendingCount}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {t("approval.all")}
              </p>
              <p className="mt-1 text-lg font-semibold">{data?.length ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => navigate(`/approvals/${v}`)}>
          <PageTabBar items={[
            { value: "pending", label: <>{t("approval.pending")}{pendingCount > 0 && (
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                "bg-[var(--status-blocked)]/12 text-[var(--status-blocked)]"
              )}>
                {pendingCount}
              </span>
            )}</> },
            { value: "all", label: t("approval.all") },
          ]} />
        </Tabs>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending" ? t("approval.noPending") : t("approval.noApprovals")}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-2.5">
          {filtered.map((approval) =>
            approval.type === "agent_question" ? (
              <AgentQuestionCard
                key={approval.id}
                approval={approval}
                requesterAgent={approval.requestedByAgentId ? (agents ?? []).find((a) => a.id === approval.requestedByAgentId) ?? null : null}
                onAnswer={(answer) => approveMutation.mutate({ id: approval.id, decisionNote: answer })}
                onDismiss={() => rejectMutation.mutate({ id: approval.id })}
                detailLink={`/approvals/${approval.id}`}
                isPending={approveMutation.isPending || rejectMutation.isPending}
              />
            ) : (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                requesterAgent={approval.requestedByAgentId ? (agents ?? []).find((a) => a.id === approval.requestedByAgentId) ?? null : null}
                onApprove={() => approveMutation.mutate({ id: approval.id })}
                onForceApprove={() => approveMutation.mutate({ id: approval.id, force: true })}
                onDismissError={() => setApproveErrorMap((prev) => { const next = { ...prev }; delete next[approval.id]; return next; })}
                onReject={(note) => rejectMutation.mutate({ id: approval.id, note })}
                onRequestRevision={(note) => requestRevisionMutation.mutate({ id: approval.id, note })}
                detailLink={`/approvals/${approval.id}`}
                isPending={approveMutation.isPending || rejectMutation.isPending || requestRevisionMutation.isPending}
                approveError={approveErrorMap[approval.id] ?? null}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
