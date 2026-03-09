import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";

interface MetricCardProps {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
  valueClassName?: string;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick, valueClassName }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const content = (
    <div className={`h-full bg-card border border-border rounded-lg px-4 py-4 sm:px-[18px] sm:py-4 transition-colors${isClickable ? " hover:bg-accent/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-[0.05em]">
            {label}
          </p>
          <p className={`mt-1.5 text-[28px] font-bold leading-[1.1] ${valueClassName ?? "text-foreground"}`}>
            {value}
          </p>
          {description && (
            <div className="text-[11px] text-muted-foreground mt-1 hidden sm:block">{description}</div>
          )}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block h-full rounded-lg no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClick}
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className="h-full w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return content;
}
