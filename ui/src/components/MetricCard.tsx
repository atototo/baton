import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div className={`h-full bg-card border border-border rounded-lg px-4 py-4 sm:px-[18px] sm:py-4 transition-colors${isClickable ? " hover:bg-accent/40 cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">
            {label}
          </p>
          <p className="text-[28px] font-bold leading-[1.1] mt-1.5 text-foreground">
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
      <Link to={to} className="no-underline text-inherit h-full" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}
