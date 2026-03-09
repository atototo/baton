import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IssueComment, Agent } from "@atototo/shared";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ImageIcon } from "lucide-react";
import { Identity } from "./Identity";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { formatDateTime } from "../lib/utils";

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  mentions?: MentionOption[];
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const DRAFT_DEBOUNCE_MS = 800;

function buildImageMarkdown(file: File, src: string): string {
  const rawAlt = file.name.replace(/\.[^.]+$/, "").trim();
  const alt = rawAlt || "image";
  return `![${alt}](${src})`;
}

function appendToDraft(current: string, snippet: string): string {
  if (!current.trim()) return snippet;
  if (current.endsWith("\n\n")) return `${current}${snippet}`;
  if (current.endsWith("\n")) return `${current}\n${snippet}`;
  return `${current}\n\n${snippet}`;
}

function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  highlightCommentId,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  highlightCommentId?: string | null;
}) {
  const { t } = useTranslation();
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("commentThread.noCommentsOrRuns")}</p>;
  }

  return (
    <div className="space-y-4">
      {timeline.map((item) => {
        if (item.kind === "run") {
          const run = item.run;
          const runAgentName = agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8);
          return (
            <div key={`run:${run.runId}`} className="flex gap-2.5">
              <Avatar size="sm" className="shrink-0 mt-0.5 rounded-[6px]">
                <AvatarFallback className="rounded-[6px] text-[9px] font-bold">{deriveInitials(runAgentName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Link to={`/agents/${run.agentId}`} className="text-xs font-semibold text-foreground hover:underline">
                    {runAgentName}
                  </Link>
                  <span className="text-[10px] text-muted-foreground">{formatDateTime(run.startedAt ?? run.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs rounded-[6px] border border-border bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">{t("commentThread.run")}</span>
                  <Link
                    to={`/agents/${run.agentId}/runs/${run.runId}`}
                    className="inline-flex items-center rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  >
                    {run.runId.slice(0, 8)}
                  </Link>
                  <StatusBadge status={run.status} />
                </div>
              </div>
            </div>
          );
        }

        const comment = item.comment;
        const isHighlighted = highlightCommentId === comment.id;
        const authorName = comment.authorAgentId
          ? (agentMap?.get(comment.authorAgentId)?.name ?? comment.authorAgentId.slice(0, 8))
          : "You";
        const isAgent = !!comment.authorAgentId;
        return (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className={`flex gap-2.5 transition-colors duration-1000 ${isHighlighted ? "bg-primary/5 -mx-2 px-2 rounded-md" : ""}`}
          >
            <Avatar size="sm" className="shrink-0 mt-0.5 rounded-[6px]">
              <AvatarFallback className="rounded-[6px] text-[9px] font-bold">{deriveInitials(authorName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                {isAgent ? (
                  <Link to={`/agents/${comment.authorAgentId}`} className="text-xs font-semibold text-foreground hover:underline">
                    {authorName}
                  </Link>
                ) : (
                  <span className="text-xs font-semibold text-foreground">{authorName}</span>
                )}
                {isAgent && (
                  <span className="text-[10px] text-muted-foreground rounded bg-muted px-1.5 py-px">Agent</span>
                )}
                {comment.runId && (
                  comment.runAgentId ? (
                    <Link
                      to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
                      className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-px text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      run {comment.runId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-px text-[10px] font-mono text-muted-foreground">
                      run {comment.runId.slice(0, 8)}
                    </span>
                  )
                )}
                <a
                  href={`#comment-${comment.id}`}
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline transition-colors ml-auto shrink-0"
                >
                  {formatDateTime(comment.createdAt)}
                </a>
              </div>
              <div className="rounded-[6px] border border-border bg-muted/30 px-3.5 py-2.5">
                <MarkdownBody className="text-[13px] leading-[1.6]">{comment.body}</MarkdownBody>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export function CommentThread({
  comments,
  linkedRuns = [],
  onAdd,
  issueStatus,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  mentions: providedMentions,
}: CommentThreadProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(currentAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  const isClosed = issueStatus ? CLOSED_STATUSES.has(issueStatus) : false;

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    return [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
  }, [comments, linkedRuns]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: a.id,
        name: a.name,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(currentAssigneeValue);
  }, [currentAssigneeValue]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, isClosed && reopen ? true : undefined, reassignment ?? undefined);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(false);
      setReassignTarget(currentAssigneeValue);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file) return;
    setAttaching(true);
    try {
      if (imageUploadHandler) {
        const src = await imageUploadHandler(file);
        setBody((current) => appendToDraft(current, buildImageMarkdown(file, src)));
        requestAnimationFrame(() => editorRef.current?.focus());
      } else if (onAttachImage) {
        await onAttachImage(file);
      }
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const canSubmit = !submitting && !!body.trim();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("commentThread.commentsAndRuns", { count: timeline.length })}</h3>

      <TimelineList timeline={timeline} agentMap={agentMap} highlightCommentId={highlightCommentId} />

      {liveRunSlot}

      <div className="flex gap-2.5">
        <Avatar size="sm" className="shrink-0 mt-0.5 rounded-[6px]">
          <AvatarFallback className="rounded-[6px] text-[9px] font-bold bg-primary/10 text-primary">BO</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-2">
          <MarkdownEditor
            ref={editorRef}
            value={body}
            onChange={setBody}
            placeholder={t("commentThread.leaveComment")}
            mentions={mentions}
            onSubmit={handleSubmit}
            imageUploadHandler={imageUploadHandler}
            contentClassName="min-h-[80px] text-[13px]"
          />
          <div className="flex items-center justify-end gap-3">
            {(onAttachImage || imageUploadHandler) && (
              <div className="mr-auto flex items-center gap-3">
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAttachFile}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => attachInputRef.current?.click()}
                  disabled={attaching}
                  title={t("commentThread.attachImage")}
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  <ImageIcon className="h-4 w-4" />
                  {t("commentThread.attachImage")}
                </Button>
              </div>
            )}
            {isClosed && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reopen}
                  onChange={(e) => setReopen(e.target.checked)}
                  className="rounded border-border"
                />
                Re-open
              </label>
            )}
            {enableReassign && reassignOptions.length > 0 && (
              <InlineEntitySelector
                value={reassignTarget}
                options={reassignOptions}
                placeholder={t("commentThread.assignee")}
                noneLabel="No assignee"
                searchPlaceholder="Search assignees..."
                emptyMessage="No assignees found."
                onChange={setReassignTarget}
                className="text-xs h-8"
              />
            )}
            <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Posting..." : "Comment"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
