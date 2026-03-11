import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";

interface InlineHelpProps {
  title: string;
  summary: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function InlineHelp({
  title,
  summary,
  children,
  defaultOpen = true,
  className,
}: InlineHelpProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-muted/50 px-3 py-2.5",
        className
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-2 text-left"
      >
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {summary}
          </p>
        </div>
      </button>
      {open && children ? (
        <div
          id={contentId}
          className="ml-6 mt-2 border-t border-border pt-2 text-xs text-muted-foreground"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
