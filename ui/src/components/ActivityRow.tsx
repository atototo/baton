import { Link } from "@/lib/router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { deriveProjectUrlKey, type ActivityEvent, type Agent } from "@atototo/shared";

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ACTION_VERBS_EN: Record<string, string> = {
  "issue.created": "created",
  "issue.updated": "updated",
  "issue.checked_out": "checked out",
  "issue.released": "released",
  "issue.comment_added": "commented on",
  "issue.attachment_added": "attached file to",
  "issue.attachment_removed": "removed attachment from",
  "issue.commented": "commented on",
  "issue.deleted": "deleted",
  "agent.created": "created",
  "agent.updated": "updated",
  "agent.paused": "paused",
  "agent.resumed": "resumed",
  "agent.terminated": "terminated",
  "agent.key_created": "created API key for",
  "agent.budget_updated": "updated budget for",
  "agent.runtime_session_reset": "reset session for",
  "heartbeat.invoked": "invoked heartbeat for",
  "heartbeat.cancelled": "cancelled heartbeat for",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "project.created": "created",
  "project.updated": "updated",
  "project.deleted": "deleted",
  "goal.created": "created",
  "goal.updated": "updated",
  "goal.deleted": "deleted",
  "cost.reported": "reported cost for",
  "cost.recorded": "recorded cost for",
  "company.created": "created company",
  "company.updated": "updated company",
  "company.archived": "archived",
  "company.budget_updated": "updated budget for",
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

interface VerbResult {
  verb: string;
  detail?: string; // e.g. "진행 중 → 완료" for status changes
}

function formatVerbI18n(
  t: (key: string, opts?: Record<string, unknown>) => string,
  action: string,
  details?: Record<string, unknown> | null,
): VerbResult {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    if (details.status !== undefined) {
      const from = previous.status;
      const toLabel = t(`statusLabels.${details.status}`, { defaultValue: humanizeValue(details.status) });
      if (from) {
        const fromLabel = t(`statusLabels.${from}`, { defaultValue: humanizeValue(from) });
        return {
          verb: t("activityVerbs.statusChange", { defaultValue: "status change" }),
          detail: t("activityVerbs.statusChangeFromTo", { from: fromLabel, to: toLabel, defaultValue: `${fromLabel} → ${toLabel}` }),
        };
      }
      return {
        verb: t("activityVerbs.statusChange", { defaultValue: "status change" }),
        detail: `→ ${toLabel}`,
      };
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      const toLabel = t(`priorityLabels.${details.priority}`, { defaultValue: humanizeValue(details.priority) });
      if (from) {
        const fromLabel = t(`priorityLabels.${from}`, { defaultValue: humanizeValue(from) });
        return {
          verb: t("activityVerbs.priorityChange", { defaultValue: "priority change" }),
          detail: t("activityVerbs.priorityChangeFromTo", { from: fromLabel, to: toLabel, defaultValue: `${fromLabel} → ${toLabel}` }),
        };
      }
      return {
        verb: t("activityVerbs.priorityChange", { defaultValue: "priority change" }),
        detail: `→ ${toLabel}`,
      };
    }
  }
  const verb = t(`activityVerbs.${action}`, { defaultValue: ACTION_VERBS_EN[action] ?? action.replace(/[._]/g, " ") });
  return { verb };
}

function entityLink(entityType: string, entityId: string, name?: string | null): string | null {
  switch (entityType) {
    case "issue": return `/issues/${name ?? entityId}`;
    case "agent": return `/agents/${entityId}`;
    case "project": return `/projects/${deriveProjectUrlKey(name, entityId)}`;
    case "goal": return `/goals/${entityId}`;
    case "approval": return `/approvals/${entityId}`;
    default: return null;
  }
}

interface ActivityRowProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap?: Map<string, string>;
  className?: string;
}

export function ActivityRow({ event, agentMap, entityNameMap, entityTitleMap, className }: ActivityRowProps) {
  const { t } = useTranslation();
  const { verb, detail } = formatVerbI18n(t, event.action, event.details);

  const isHeartbeatEvent = event.entityType === "heartbeat_run";
  const heartbeatAgentId = isHeartbeatEvent
    ? (event.details as Record<string, unknown> | null)?.agentId as string | undefined
    : undefined;

  const name = isHeartbeatEvent
    ? (heartbeatAgentId ? entityNameMap.get(`agent:${heartbeatAgentId}`) : null)
    : entityNameMap.get(`${event.entityType}:${event.entityId}`);

  const entityTitle = entityTitleMap?.get(`${event.entityType}:${event.entityId}`);

  const link = isHeartbeatEvent && heartbeatAgentId
    ? `/agents/${heartbeatAgentId}/runs/${event.entityId}`
    : entityLink(event.entityType, event.entityId, name);

  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName = actor?.name ?? (event.actorType === "system" ? "System" : event.actorType === "user" ? "Board" : event.actorId || "Unknown");

  const inner = (
    <div className="flex gap-2.5">
      <Avatar size="xs" className="shrink-0 mt-0.5 rounded-[5px]">
        <AvatarFallback className="rounded-[5px] text-[9px] font-bold">{deriveInitials(actorName)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1 flex-wrap text-[11px] leading-[1.5]">
          <span className="font-medium text-foreground shrink-0">{actorName}</span>
          <span className="text-muted-foreground">{verb}</span>
          {name && <span className="font-semibold text-foreground">{name}</span>}
          {detail && (
            <span className="text-[10px] text-muted-foreground/80 font-mono">{detail}</span>
          )}
        </div>
        {entityTitle && (
          <p className="text-[10px] leading-[1.4] text-muted-foreground truncate mt-px">{entityTitle}</p>
        )}
        <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">{timeAgo(event.createdAt)}</span>
      </div>
    </div>
  );

  const classes = cn(
    "px-3.5 py-2 text-[11px]",
    link && "cursor-pointer hover:bg-accent/50 transition-colors",
    className,
  );

  if (link) {
    return (
      <Link to={link} className={cn(classes, "no-underline text-inherit block")}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={classes}>
      {inner}
    </div>
  );
}
