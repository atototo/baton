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
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
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

// 목업 기준 컬럼 헤더 도트 색상
const statusDotColor: Record<string, string> = {
  backlog: "bg-[#9ca3af]",
  todo: "bg-[#6b7280]",
  in_progress: "bg-[var(--status-active)]",
  in_review: "bg-[var(--status-review)]",
  blocked: "bg-[var(--status-blocked)]",
  done: "bg-[var(--status-done)]",
  cancelled: "bg-neutral-400",
};

interface Agent {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  onShowMore?: (status: string) => void;
}

/* ── Droppable Column ── */

const DONE_COLUMN_LIMIT = 5;
const doneStatuses = new Set(["done", "cancelled"]);

function KanbanColumn({
  status,
  issues,
  agents,
  liveIssueIds,
  onShowMore,
}: {
  status: string;
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onShowMore?: (status: string) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const isBlocked = status === "blocked";
  const isDone = doneStatuses.has(status);

  const dotClass = statusDotColor[status] ?? "bg-muted-foreground";

  // 완료/취소 컬럼은 최근 N개만 표시
  const visibleIssues = isDone ? issues.slice(0, DONE_COLUMN_LIMIT) : issues;
  const hiddenCount = isDone ? Math.max(0, issues.length - DONE_COLUMN_LIMIT) : 0;

  return (
    <div className={`flex flex-col min-w-[180px] flex-1 ${isDone ? "opacity-60" : ""}`}>
      {/* 목업 스타일: 8px 컬러 도트 + 11px uppercase 타이틀 + 카운트 */}
      <div className="flex items-center gap-[7px] px-1.5 pt-1 pb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="section-title text-muted-foreground after:hidden">
          {t(`statusLabels.${status}`, { defaultValue: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          {issues.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[60px] rounded-[7px] p-1 space-y-[5px] transition-colors ${
          isOver ? "bg-accent/60" : isBlocked ? "bg-red-500/[0.04] border border-red-500/10" : "bg-secondary/80"
        }`}
      >
        <SortableContext
          items={visibleIssues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleIssues.map((issue) => (
            <KanbanCard
              key={issue.id}
              issue={issue}
              agents={agents}
              isLive={liveIssueIds?.has(issue.id)}
            />
          ))}
        </SortableContext>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onShowMore?.(status)}
            className="w-full rounded-[5px] px-3 py-2 text-center text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            {t("kanban.showMore", { count: hiddenCount, defaultValue: `${hiddenCount}개 더 보기` })}
          </button>
        )}
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
  const isActiveStatus = issue.status === "in_progress";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-[6px] border bg-card cursor-grab active:cursor-grabbing transition-all ${
        isDragging && !isOverlay ? "opacity-30" : ""
      } ${isOverlay ? "shadow-lg ring-1 ring-primary/20" : "hover:border-[var(--border-mid,#d9d9dc)] hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)]"} ${
        isBlockedStatus ? "border-l-[3px] border-l-[var(--status-blocked)]" : isActiveStatus ? "border-l-[3px] border-l-[var(--status-active)]" : ""
      }`}
    >
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        className="block no-underline text-inherit px-[12px] pt-[10px] pb-[10px]"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span
              className="ml-auto w-[6px] h-[6px] rounded-full bg-[var(--status-active)] shrink-0"
              style={{ animation: "kblink 1.8s ease-in-out infinite" }}
            />
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
  onShowMore,
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
      <div className="flex gap-[10px] overflow-x-auto h-full items-stretch">
        {boardStatuses
          .filter((status) => {
            // 완료/취소 컬럼은 이슈가 있을 때만 표시
            if (status === "cancelled" && (columnIssues[status] ?? []).length === 0) return false;
            return true;
          })
          .map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            issues={columnIssues[status] ?? []}
            agents={agents}
            liveIssueIds={liveIssueIds}
            onShowMore={onShowMore}
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
