import { CheckCircle, GitPullRequest, Lightbulb, ListChecks, ShieldCheck, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  approve_issue_plan: ListChecks,
  approve_pull_request: GitPullRequest,
  approve_completion: CheckCircle,
};

export const defaultTypeIcon = ShieldCheck;

export function useTypeLabel(): Record<string, string> {
  const { t } = useTranslation();
  return {
    hire_agent: t("approval.typeHireAgent"),
    approve_ceo_strategy: t("approval.typeCeoStrategy"),
    approve_issue_plan: t("approval.typeIssuePlan"),
    approve_pull_request: t("approval.typePullRequest"),
    approve_completion: t("approval.typeCompletion"),
  };
}

/** @deprecated Use useTypeLabel() hook instead */
export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  approve_issue_plan: "Issue Plan",
  approve_pull_request: "Pull Request",
  approve_completion: "Completion",
};

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{t("approval.name")}</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label={t("approval.role")} value={payload.role} />
      <PayloadField label={t("approval.title")} value={payload.title} />
      <PayloadField label={t("approval.icon")} value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">{t("approval.capabilities")}</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{t("approval.adapter")}</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const { t } = useTranslation();
  const plan = payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label={t("approval.title")} value={payload.title} />
      {!!plan && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(plan)}
        </div>
      )}
      {!plan && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function GenericApprovalPayload({ payload }: { payload: Record<string, unknown> }) {
  const { t } = useTranslation();
  const workspace =
    typeof payload.workspace === "object" && payload.workspace !== null
      ? (payload.workspace as Record<string, unknown>)
      : null;
  const summary =
    payload.summary ??
    payload.title ??
    payload.plan ??
    payload.description ??
    payload.body ??
    payload.reason;

  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label={t("approval.title")} value={payload.title} />
      <PayloadField label={t("approval.branch")} value={payload.branch} />
      <PayloadField label={t("approval.baseBranch")} value={payload.baseBranch} />
      <PayloadField label={t("approval.headBranch")} value={payload.headBranch} />
      <PayloadField label={t("approval.repository")} value={payload.repository} />
      {workspace && (
        <>
          <PayloadField label="Ticket" value={workspace.ticketKey} />
          <PayloadField label={t("approval.branch")} value={workspace.branch} />
          <PayloadField label={t("approval.baseBranch")} value={workspace.baseBranch} />
          <PayloadField label="Workspace" value={workspace.projectWorkspaceName} />
          <PayloadField label="Repo Path" value={workspace.sourceRepoCwd} />
        </>
      )}
      {!!summary && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(summary)}
        </div>
      )}
      {!summary && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "approve_ceo_strategy") return <CeoStrategyPayload payload={payload} />;
  return <GenericApprovalPayload payload={payload} />;
}
