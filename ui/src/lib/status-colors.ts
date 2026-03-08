/**
 * Canonical status & priority color definitions.
 *
 * Every component that renders a status indicator (StatusIcon, StatusBadge,
 * agent status dots, etc.) should import from here so colors stay consistent.
 */

// ---------------------------------------------------------------------------
// Issue status colors
// ---------------------------------------------------------------------------

/** StatusIcon circle: text + border classes */
export const issueStatusIcon: Record<string, string> = {
  backlog: "text-muted-foreground/50 border-muted-foreground/50",
  todo: "text-muted-foreground border-muted-foreground",
  in_progress: "text-[var(--status-active)] border-[var(--status-active)]",
  in_review: "text-[var(--status-review)] border-[var(--status-review)]",
  done: "text-[var(--status-done)] border-[var(--status-done)]",
  cancelled: "text-neutral-400 border-neutral-400",
  blocked: "text-[var(--status-blocked)] border-[var(--status-blocked)]",
};

export const issueStatusIconDefault = "text-muted-foreground border-muted-foreground";

/** Text-only color for issue statuses (dropdowns, labels) */
export const issueStatusText: Record<string, string> = {
  backlog: "text-muted-foreground/50",
  todo: "text-muted-foreground",
  in_progress: "text-[var(--status-active)]",
  in_review: "text-[var(--status-review)]",
  done: "text-[var(--status-done)]",
  cancelled: "text-neutral-400",
  blocked: "text-[var(--status-blocked)]",
};

export const issueStatusTextDefault = "text-muted-foreground";

// ---------------------------------------------------------------------------
// Badge colors — used by StatusBadge for all entity types
// ---------------------------------------------------------------------------

export const statusBadge: Record<string, string> = {
  // Agent statuses
  active: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  running: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
  paused: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  idle: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  archived: "bg-muted text-muted-foreground",

  // Goal statuses
  planned: "bg-muted text-muted-foreground",
  achieved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",

  // Run statuses
  failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  timed_out: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  succeeded: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  terminated: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",

  // Approval statuses
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  revision_requested: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",

  // Issue statuses — aligned with mockup palette (CSS variable tokens)
  backlog: "bg-muted/60 text-muted-foreground",
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-[rgba(37,99,235,0.08)] text-[var(--status-active)] dark:bg-[rgba(96,165,250,0.12)]",
  in_review: "bg-[rgba(124,58,237,0.08)] text-[var(--status-review)] dark:bg-[rgba(167,139,250,0.12)]",
  blocked: "bg-[rgba(220,38,38,0.08)] text-[var(--status-blocked)] dark:bg-[rgba(248,113,113,0.12)]",
  done: "bg-[rgba(22,163,74,0.08)] text-[var(--status-done)] dark:bg-[rgba(74,222,128,0.12)]",
  cancelled: "bg-muted text-muted-foreground",
};

export const statusBadgeDefault = "bg-muted text-muted-foreground";

// ---------------------------------------------------------------------------
// Agent status dot — solid background for small indicator dots
// ---------------------------------------------------------------------------

export const agentStatusDot: Record<string, string> = {
  running: "bg-cyan-400 animate-pulse",
  active: "bg-green-400",
  paused: "bg-yellow-400",
  idle: "bg-yellow-400",
  pending_approval: "bg-amber-400",
  error: "bg-red-400",
  archived: "bg-neutral-400",
};

export const agentStatusDotDefault = "bg-neutral-400";

export const agentAvatarSurface: Record<string, string> = {
  running: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-200",
  active: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
  idle: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-200",
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
  error: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
  archived: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground",
};

export const agentAvatarSurfaceDefault = "bg-muted text-muted-foreground";

// ---------------------------------------------------------------------------
// Priority colors
// ---------------------------------------------------------------------------

export const priorityColor: Record<string, string> = {
  critical: "text-[var(--priority-critical)]",
  high: "text-[var(--priority-high)]",
  medium: "text-[var(--priority-medium)]",
  low: "text-[var(--priority-low)]",
};

export const priorityColorDefault = "text-[var(--priority-medium)]";

export const priorityColorValue: Record<string, string> = {
  critical: "var(--priority-critical)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

export const priorityColorValueDefault = "var(--priority-medium)";

export const issueStatusColorValue: Record<string, string> = {
  todo: "var(--status-active)",
  in_progress: "var(--status-active)",
  in_review: "var(--status-review)",
  done: "var(--status-done)",
  blocked: "var(--status-blocked)",
  cancelled: "var(--priority-low)",
  backlog: "var(--muted-foreground)",
};

export const issueStatusColorValueDefault = "var(--muted-foreground)";
