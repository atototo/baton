import { cn } from "../lib/utils";
import { agentAvatarSurface, agentAvatarSurfaceDefault } from "../lib/status-colors";

interface AgentAvatarProps {
  name: string;
  status: string;
  className?: string;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AgentAvatar({ name, status, className }: AgentAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-[10px] font-semibold uppercase tracking-[0.04em]",
        agentAvatarSurface[status] ?? agentAvatarSurfaceDefault,
        className,
      )}
    >
      {deriveInitials(name)}
    </span>
  );
}
