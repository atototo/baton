import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, message, action, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state-shell" role="status" aria-live="polite">
      <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-border/80 bg-[var(--bg-overlay)]">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      {action && onAction && (
        <Button onClick={onAction}>
          <Plus className="h-4 w-4 mr-1.5" />
          {action}
        </Button>
      )}
    </div>
  );
}
