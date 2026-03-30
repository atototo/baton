export function BatonBrand({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center ${compact ? "gap-2" : "gap-2.5"} ${className}`.trim()}>
      <img
        src="/baton-mark-transparent.png"
        alt="Baton mark"
        className={compact ? "h-7 w-7 shrink-0 rounded-[6px]" : "h-8 w-8 shrink-0 rounded-[7px]"}
      />
      <span className="shrink-0 text-[15px] font-bold tracking-[-0.02em] text-primary">
        baton
      </span>
    </div>
  );
}
