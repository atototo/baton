import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AlertTriangle } from "lucide-react";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { issueStatusText } from "../lib/status-colors";
import type { Issue } from "@atototo/shared";

const boardStatuses = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];

interface Agent {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
}

/* ── Droppable Column ── */

function KanbanColumn({
  status,
  issues,
  agents,
  liveIssueIds,
}: {
  status: string;
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const isBlocked = status === "blocked";

  const coloredStatuses = ["in_progress", "in_review", "blocked", "done"];
  const headerTextClass = coloredStatuses.includes(status)
    ? issueStatusText[status]
    : "text-muted-foreground";

  return (
    <div className="flex flex-col min-w-[248px] w-[248px] shrink-0">
      <div className="flex items-center gap-1.5 px-1.5 pt-1 pb-2">
        <StatusIcon status={status} />
        <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${headerTextClass}`}>
          {t(`statusLabels.${status}`, { defaultValue: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })}
        </span>
        {isBlocked && (
          <AlertTriangle className="h-3 w-3 text-[var(--status-blocked)] shrink-0" />
        )}
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          {issues.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[60px] rounded-[7px] p-1 space-y-[5px] transition-colors ${
          isOver ? "bg-accent/60" : isBlocked ? "bg-red-500/[0.04] border border-red-500/10" : "bg-secondary"
        }`}
      >
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => (
            <KanbanCard
              key={issue.id}
              issue={issue}
              agents={agents}
              isLive={liveIssueIds?.has(issue.id)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/* ── Draggable Card ── */

function KanbanCard({
  issue,
  agents,
  isLive,
  isOverlay,
}: {
  issue: Issue;
  agents?: Agent[];
  isLive?: boolean;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, data: { issue } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  const isBlockedStatus = issue.status === "blocked";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-[6px] border bg-card cursor-grab active:cursor-grabbing transition-all ${
        isDragging && !isOverlay ? "opacity-30" : ""
      } ${isOverlay ? "shadow-lg ring-1 ring-primary/20" : "hover:border-border/80 hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)]"} ${
        isBlockedStatus ? "border-l-[3px] border-l-red-500" : ""
      }`}
    >
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        className="block no-underline text-inherit px-3 pt-2.5 pb-2.5"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span className="ml-auto flex h-[6px] w-[6px] shrink-0">
              <span className="animate-ping absolute inline-flex h-[6px] w-[6px] rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-blue-500" />
            </span>
          )}
        </div>
        <p className="text-[12px] leading-[1.45] line-clamp-2 mb-[9px] text-foreground">{issue.title}</p>
        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          {issue.assigneeAgentId && (() => {
            const name = agentName(issue.assigneeAgentId);
            return name ? (
              <span className="ml-auto flex items-center gap-1 px-[7px] py-0.5 pl-[3px] rounded-[4px] bg-secondary border border-border text-[10px] text-muted-foreground">
                <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-[3px] bg-primary/10 text-[8px] font-bold text-primary shrink-0">
                  {name.slice(0, 2).toUpperCase()}
                </span>
                {name}
              </span>
            ) : (
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                {issue.assigneeAgentId.slice(0, 6)}
              </span>
            );
          })()}
        </div>
      </Link>
    </div>
  );
}

/* ── Main Board ── */

export function KanbanBoard({
  issues,
  agents,
  liveIssueIds,
  onUpdateIssue,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const columnIssues = useMemo(() => {
    const grouped: Record<string, Issue[]> = {};
    for (const status of boardStatuses) {
      grouped[status] = [];
    }
    for (const issue of issues) {
      if (grouped[issue.status]) {
        grouped[issue.status].push(issue);
      }
    }
    return grouped;
  }, [issues]);

  const activeIssue = useMemo(
    () => (activeId ? issues.find((i) => i.id === activeId) : null),
    [activeId, issues]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const issueId = active.id as string;
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    // Determine target status: the "over" could be a column id (status string)
    // or another card's id. Find which column the "over" belongs to.
    let targetStatus: string | null = null;

    if (boardStatuses.includes(over.id as string)) {
      targetStatus = over.id as string;
    } else {
      // It's a card - find which column it's in
      const targetIssue = issues.find((i) => i.id === over.id);
      if (targetIssue) {
        targetStatus = targetIssue.status;
      }
    }

    if (targetStatus && targetStatus !== issue.status) {
      onUpdateIssue(issueId, { status: targetStatus });
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // Could be used for visual feedback; keeping simple for now
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {boardStatuses.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            issues={columnIssues[status] ?? []}
            agents={agents}
            liveIssueIds={liveIssueIds}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? (
          <KanbanCard issue={activeIssue} agents={agents} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
