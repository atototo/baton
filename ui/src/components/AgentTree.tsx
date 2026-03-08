/**
 * AgentTree — 좌측 240px 패널
 *
 * 기존 CompanyRail + Sidebar를 통합한 새 레이아웃 컴포넌트.
 * - 상단: 바톤 로고 + 회사 선택(CompanyRail 기능)
 * - 네비게이션: 기존 Sidebar 전체 네비게이션 보존
 * - 에이전트 조직도 트리: SidebarAgents 기반
 */

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation, useNavigate } from "@/lib/router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronRight,
  CircleDot,
  DollarSign,
  History,
  Inbox,
  LayoutDashboard,
  Moon,
  Network,
  Plus,
  Search,
  Settings,
  SquarePen,
  Sun,
  Target,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { useTheme } from "../context/ThemeContext";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { authApi } from "../api/auth";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl, projectRouteRef } from "../lib/utils";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { CompanyPatternIcon } from "./CompanyPatternIcon";
import { SidebarNavItem } from "./SidebarNavItem";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { Agent, Company, Issue, Project } from "@atototo/shared";

// ─── Company order helpers ────────────────────────────────────────────────────

const ORDER_STORAGE_KEY = "baton.companyOrder";

function getStoredOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveOrder(ids: string[]) {
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids));
}

function sortByStoredOrder(companies: Company[]): Company[] {
  const order = getStoredOrder();
  if (order.length === 0) return companies;
  const byId = new Map(companies.map((c) => [c.id, c]));
  const sorted: Company[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c) { sorted.push(c); byId.delete(id); }
  }
  for (const c of byId.values()) sorted.push(c);
  return sorted;
}

// ─── Agent tree helpers ───────────────────────────────────────────────────────

interface AgentTreeNode {
  agent: Agent;
  depth: number;
  children: AgentTreeNode[];
}

function buildAgentTree(agents: Agent[]): AgentTreeNode[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const parent = a.reportsTo && byId.has(a.reportsTo) ? a.reportsTo : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(a);
    childrenOf.set(parent, list);
  }
  function visit(agent: Agent, depth: number): AgentTreeNode {
    const children = (childrenOf.get(agent.id) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => visit(child, depth + 1));
    return { agent, depth, children };
  }
  return (childrenOf.get(null) ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((agent) => visit(agent, 0));
}

function flattenAgentTree(nodes: AgentTreeNode[]): AgentTreeNode[] {
  const result: AgentTreeNode[] = [];
  function walk(node: AgentTreeNode) {
    result.push(node);
    node.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** 아바타 배경/글자 tint: 상태별 */
function agentAvClass(status: string): string {
  switch (status) {
    case "active":
    case "running":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "error":
    case "blocked":
      return "bg-red-500/10 text-red-600 dark:text-red-400";
    case "paused":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "pending_approval":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400";
    default:
      return "bg-accent/60 text-muted-foreground";
  }
}

/** 상태 도트 색상 */
function statusDotClass(status: string): string {
  switch (status) {
    case "active":
    case "running":
      return "bg-blue-500";
    case "error":
      return "bg-red-500";
    default:
      return "hidden";
  }
}

/** 에이전트 이니셜 (최대 2글자) */
function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function agentSecondaryText(params: {
  agent: Agent;
  inProgressIssue?: Issue;
  blockedIssue?: Issue;
  blockedIssueHasPendingApproval: boolean;
}): string {
  const { agent, inProgressIssue, blockedIssue, blockedIssueHasPendingApproval } = params;
  if (blockedIssue || agent.status === "error") {
    return blockedIssue && blockedIssueHasPendingApproval ? "차단됨 — 승인 대기" : "차단됨";
  }
  if (inProgressIssue) {
    return inProgressIssue.identifier ?? inProgressIssue.title;
  }
  return "대기 중";
}

// ─── SortableCompanyItem ──────────────────────────────────────────────────────

function SortableCompanyItem({
  company,
  isSelected,
  hasLiveAgents,
  hasUnreadInbox,
  onSelect,
}: {
  company: Company;
  isSelected: boolean;
  hasLiveAgents: boolean;
  hasUnreadInbox: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: company.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.8 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="overflow-visible">
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <a
            href={`/${company.issuePrefix}/dashboard`}
            onClick={(e) => { e.preventDefault(); onSelect(); }}
            className="relative flex items-center gap-2 rounded-[5px] px-[10px] py-[6px] transition-colors hover:bg-accent/50 group overflow-visible"
          >
            <div className="relative overflow-visible shrink-0">
              <CompanyPatternIcon
                companyName={company.name}
                brandColor={company.brandColor}
                className={cn(
                  "h-[22px] w-[22px] !rounded-[5px] text-[9px]",
                  isSelected ? "ring-2 ring-primary/40" : "",
                )}
              />
              {hasLiveAgents && (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 z-10">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-80" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500 ring-1 ring-background" />
                  </span>
                </span>
              )}
              {hasUnreadInbox && !hasLiveAgents && (
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 h-2 w-2 rounded-full bg-red-500 ring-1 ring-background" />
              )}
            </div>
            <span className={cn("flex-1 truncate text-[13px] font-normal", isSelected ? "text-foreground" : "text-foreground/70 group-hover:text-foreground")}>
              {company.name}
            </span>
            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
          </a>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p>{company.name}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── SortableProjectItem ──────────────────────────────────────────────────────

function SortableProjectItem({
  activeProjectRef: activeRef,
  isMobile,
  project,
  setSidebarOpen,
}: {
  activeProjectRef: string | null;
  isMobile: boolean;
  project: Project;
  setSidebarOpen: (open: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const routeRef = projectRouteRef(project);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={cn(isDragging && "opacity-80")}
      {...attributes}
      {...listeners}
    >
      <NavLink
        to={`/projects/${routeRef}/issues`}
        onClick={() => { if (isMobile) setSidebarOpen(false); }}
        className={cn(
          "flex items-center gap-2 rounded-[5px] px-[10px] py-[6px] text-[13px] font-normal transition-colors",
          activeRef === routeRef || activeRef === project.id
            ? "bg-primary/8 text-primary"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <span className="shrink-0 h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: project.color ?? "#6366f1" }} />
        <span className="flex-1 truncate">{project.name}</span>
      </NavLink>
    </div>
  );
}

// ─── AgentTree (main export) ──────────────────────────────────────────────────

export function AgentTree() {
  const { t } = useTranslation();
  const { companies, selectedCompanyId, setSelectedCompanyId, selectedCompany } = useCompany();
  const { openOnboarding, openNewIssue, openNewProject } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const nextTheme = theme === "dark" ? "light" : "dark";

  const [agentsOpen, setAgentsOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [companiesOpen, setCompaniesOpen] = useState(false);

  // ── Company order ──
  const sidebarCompanies = useMemo(
    () => companies.filter((c) => c.status !== "archived"),
    [companies],
  );
  const companyIds = useMemo(() => sidebarCompanies.map((c) => c.id), [sidebarCompanies]);

  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    sortByStoredOrder(sidebarCompanies).map((c) => c.id)
  );
  useEffect(() => {
    if (sidebarCompanies.length === 0) { setOrderedIds([]); return; }
    setOrderedIds(sortByStoredOrder(sidebarCompanies).map((c) => c.id));
  }, [sidebarCompanies]);
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== ORDER_STORAGE_KEY) return;
      try { setOrderedIds(e.newValue ? JSON.parse(e.newValue) : []); } catch { /* ignore */ }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  const orderedCompanies = useMemo(() => {
    const byId = new Map(sidebarCompanies.map((c) => [c.id, c]));
    const result: Company[] = [];
    for (const id of orderedIds) { const c = byId.get(id); if (c) { result.push(c); byId.delete(id); } }
    for (const c of byId.values()) result.push(c);
    return result;
  }, [sidebarCompanies, orderedIds]);

  const companySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleCompanyDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedCompanies.map((c) => c.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newIds = arrayMove(ids, oldIndex, newIndex);
    setOrderedIds(newIds);
    saveOrder(newIds);
  }, [orderedCompanies]);

  // ── Live runs & badges ──
  const liveRunsQueries = useQueries({
    queries: companyIds.map((companyId) => ({
      queryKey: queryKeys.liveRuns(companyId),
      queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
      refetchInterval: 10_000,
    })),
  });
  const sidebarBadgeQueries = useQueries({
    queries: companyIds.map((companyId) => ({
      queryKey: queryKeys.sidebarBadges(companyId),
      queryFn: () => sidebarBadgesApi.get(companyId),
      refetchInterval: 15_000,
    })),
  });
  const hasLiveAgentsByCompanyId = useMemo(() => {
    const result = new Map<string, boolean>();
    companyIds.forEach((id, i) => result.set(id, (liveRunsQueries[i]?.data?.length ?? 0) > 0));
    return result;
  }, [companyIds, liveRunsQueries]);
  const hasUnreadInboxByCompanyId = useMemo(() => {
    const result = new Map<string, boolean>();
    companyIds.forEach((id, i) => result.set(id, (sidebarBadgeQueries[i]?.data?.inbox ?? 0) > 0));
    return result;
  }, [companyIds, sidebarBadgeQueries]);

  // ── Sidebar badges for selected company ──
  const { data: sidebarBadges } = useQuery({
    queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
    queryFn: () => sidebarBadgesApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  // ── Agents ──
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: activeIssues } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "agent-tree", "in_progress", "blocked"],
    queryFn: () => issuesApi.list(selectedCompanyId!, { status: "in_progress,blocked" }),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const { data: pendingApprovals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const pendingApprovalIssueQueries = useQueries({
    queries: (pendingApprovals ?? []).map((approval) => ({
      queryKey: queryKeys.approvals.issues(approval.id),
      queryFn: () => approvalsApi.listIssues(approval.id),
      enabled: !!selectedCompanyId,
      refetchInterval: 10_000,
    })),
  });
  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    return counts;
  }, [liveRuns]);
  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter((a: Agent) => a.status !== "terminated");
    return flattenAgentTree(buildAgentTree(filtered));
  }, [agents]);
  const inProgressIssueByAgentId = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of activeIssues ?? []) {
      if (issue.status !== "in_progress" || !issue.assigneeAgentId || map.has(issue.assigneeAgentId)) continue;
      map.set(issue.assigneeAgentId, issue);
    }
    return map;
  }, [activeIssues]);
  const blockedIssueByAgentId = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of activeIssues ?? []) {
      if (issue.status !== "blocked" || !issue.assigneeAgentId || map.has(issue.assigneeAgentId)) continue;
      map.set(issue.assigneeAgentId, issue);
    }
    return map;
  }, [activeIssues]);
  const blockedIssueIdsWithPendingApproval = useMemo(() => {
    const result = new Set<string>();
    pendingApprovalIssueQueries.forEach((query) => {
      for (const issue of query.data ?? []) {
        if (issue.status === "blocked") result.add(issue.id);
      }
    });
    return result;
  }, [pendingApprovalIssueQueries]);
  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)/);
  const activeAgentId = agentMatch?.[1] ?? null;

  // ── Projects ──
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p: Project) => !p.archivedAt),
    [projects],
  );
  const { orderedProjects, persistOrder } = useProjectOrder({
    projects: visibleProjects,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });
  const projectMatch = location.pathname.match(/^\/(?:[^/]+\/)?projects\/([^/]+)/);
  const activeProjectRef = projectMatch?.[1] ?? null;

  const projectSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleProjectDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedProjects.map((p) => p.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    persistOrder(arrayMove(ids, oldIndex, newIndex));
  }, [orderedProjects, persistOrder]);

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <aside className="h-full min-h-0 flex flex-col bg-sidebar border-r border-border/80">
      {/* ── 헤더: 바톤 로고 + 회사명 ── */}
      <div className="flex items-center gap-2 px-[14px] h-12 shrink-0 border-b border-border">
        <button
          onClick={() => setCompaniesOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 group"
          aria-label="회사 선택"
        >
          <div className="flex items-center gap-[7px] min-w-0">
            <div className="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-primary text-primary-foreground">
              <span className="absolute left-[5px] top-[6px] h-[3px] w-[3px] rounded-full bg-current" />
              <span className="absolute right-[5px] top-[6px] h-[3px] w-[3px] rounded-full bg-current" />
              <span className="absolute left-[6px] top-[10px] h-[2px] w-[10px] rounded-full bg-current" />
            </div>
            <span className="shrink-0 text-[15px] font-bold tracking-[-0.02em] text-primary">
              baton
            </span>
          </div>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground group-hover:text-foreground">
            {selectedCompany?.name ?? t("sidebar.selectCompany")}
          </span>
          <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform shrink-0", companiesOpen && "rotate-90")} />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
          aria-label="검색"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* ── 회사 선택 드롭다운 (접힘) ── */}
      {companiesOpen && (
        <div className="border-b border-border bg-background/50 px-2 py-2">
          <DndContext sensors={companySensors} collisionDetection={closestCenter} onDragEnd={handleCompanyDragEnd}>
            <SortableContext items={orderedCompanies.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-0.5">
                {orderedCompanies.map((company) => (
                  <SortableCompanyItem
                    key={company.id}
                    company={company}
                    isSelected={company.id === selectedCompanyId}
                    hasLiveAgents={hasLiveAgentsByCompanyId.get(company.id) ?? false}
                    hasUnreadInbox={hasUnreadInboxByCompanyId.get(company.id) ?? false}
                    onSelect={() => { setSelectedCompanyId(company.id); setCompaniesOpen(false); }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            onClick={() => { openOnboarding(); setCompaniesOpen(false); }}
            className="mt-1 flex w-full items-center gap-2 rounded-[5px] px-[10px] py-[6px] text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("companyRail.addCompany")}
          </button>
        </div>
      )}

      {/* ── 스크롤 가능한 nav 영역 ── */}
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col px-2 py-2">

        {/* 새 이슈 버튼 + 주요 네비게이션 */}
        <div className="flex flex-col gap-0.5 mb-1">
          <button
            onClick={() => openNewIssue()}
            className="mb-1 flex items-center gap-2 rounded-[5px] border border-border bg-transparent px-[10px] py-[6px] text-[13px] font-normal text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("nav.newIssue")}</span>
          </button>
          <SidebarNavItem to="/dashboard" label={t("nav.dashboard")} icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem
            to="/inbox"
            label={t("nav.inbox")}
            icon={Inbox}
            badge={sidebarBadges?.inbox}
            badgeTone={sidebarBadges?.failedRuns ? "danger" : "default"}
            alert={(sidebarBadges?.failedRuns ?? 0) > 0}
          />
        </div>

        {/* 섹션 디바이더 */}
        <div className="mx-1 my-2 h-px bg-border" />

        {/* Work 섹션 */}
        <div className="flex flex-col gap-0.5 mb-1">
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
              {t("sidebar.work")}
            </span>
          </div>
          <SidebarNavItem to="/issues" label={t("nav.issues")} icon={CircleDot} />
          <SidebarNavItem to="/goals" label={t("nav.goals")} icon={Target} />
        </div>

        {/* 섹션 디바이더 */}
        <div className="mx-1 my-2 h-px bg-border" />

        {/* 에이전트 트리 섹션 */}
        <Collapsible open={agentsOpen} onOpenChange={setAgentsOpen}>
          <div className="group">
            <div className="flex items-center px-2 py-1">
              <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
                <ChevronRight className={cn("h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100", agentsOpen && "rotate-90")} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">{t("nav.agents")}</span>
              </CollapsibleTrigger>
            </div>
          </div>
          <CollapsibleContent>
            <div className="mt-0.5 flex max-h-[320px] flex-col overflow-y-auto">
              {visibleAgents.map(({ agent, depth }: AgentTreeNode) => {
                const runCount = liveCountByAgent.get(agent.id) ?? 0;
                const inProgressIssue = inProgressIssueByAgentId.get(agent.id);
                const blockedIssue = blockedIssueByAgentId.get(agent.id);
                const isActive = activeAgentId === agentRouteRef(agent);
                const dotClass = blockedIssue ? "bg-red-500" : statusDotClass(agent.status);
                const showDot = dotClass !== "hidden";
                const secondaryText = agentSecondaryText({
                  agent,
                  inProgressIssue,
                  blockedIssue,
                  blockedIssueHasPendingApproval: blockedIssue
                    ? blockedIssueIdsWithPendingApproval.has(blockedIssue.id)
                    : false,
                });
                return (
                  <NavLink
                    key={agent.id}
                    to={agentUrl(agent)}
                    onClick={() => { if (isMobile) setSidebarOpen(false); }}
                    className={cn(
                      "relative mb-px flex items-start gap-2 rounded-[5px] px-[10px] py-[5px] text-[13px] transition-colors",
                      isActive
                        ? "bg-primary/8 text-primary"
                        : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
                    )}
                    style={{ paddingLeft: depth > 0 ? `${10 + depth * 16}px` : undefined }}
                  >
                    {depth > 0 && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-[calc(var(--depth-offset)-4px)] top-1/2 h-px w-2 -translate-y-1/2 bg-border"
                        style={{ ["--depth-offset" as string]: `${10 + depth * 16}px` }}
                      />
                    )}
                    <span
                      className={cn(
                        "relative mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-[10px] font-bold leading-none",
                        agentAvClass(agent.status),
                      )}
                    >
                      {agentInitials(agent.name)}
                      {showDot && (
                        <span
                          className={cn(
                            "absolute -top-[3px] -right-[3px] h-[7px] w-[7px] rounded-full border-[1.5px] border-sidebar",
                            dotClass,
                          )}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium leading-none">{agent.name}</span>
                        {runCount > 0 && (
                          <span className="relative flex h-[7px] w-[7px] shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-blue-500" />
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-[10px] leading-none text-muted-foreground">
                        {secondaryText}
                      </span>
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* 섹션 디바이더 */}
        <div className="mx-1 my-2 h-px bg-border" />

        {/* 프로젝트 섹션 */}
        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
          <div className="group">
            <div className="flex items-center px-2 py-1">
              <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
                <ChevronRight className={cn("h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100", projectsOpen && "rotate-90")} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                  {t("nav.projects")}
                </span>
              </CollapsibleTrigger>
              <button
                onClick={(e) => { e.stopPropagation(); openNewProject(); }}
                className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground"
                aria-label={t("projects.addProject")}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
          <CollapsibleContent>
            <DndContext sensors={projectSensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
              <SortableContext items={orderedProjects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {orderedProjects.map((project: Project) => (
                    <SortableProjectItem
                      key={project.id}
                      activeProjectRef={activeProjectRef}
                      isMobile={isMobile}
                      project={project}
                      setSidebarOpen={setSidebarOpen}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CollapsibleContent>
        </Collapsible>

        {/* 섹션 디바이더 */}
        <div className="mx-1 my-2 h-px bg-border" />

        {/* 회사 섹션 */}
        <div className="flex flex-col gap-0.5">
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
              {t("sidebar.company")}
            </span>
          </div>
          <SidebarNavItem to="/org" label={t("nav.org")} icon={Network} />
          <SidebarNavItem to="/costs" label={t("nav.costs")} icon={DollarSign} />
          <SidebarNavItem to="/activity" label={t("nav.activity")} icon={History} />
          <SidebarNavItem to="/company/settings" label={t("nav.settings")} icon={Settings} />
        </div>

      </nav>

      {/* ── 하단: 문서 + 테마 토글 ── */}
      <div className="border-t border-border px-2 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <SidebarNavItem to="/docs" label="Documentation" icon={BookOpen} className="flex-1 min-w-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground shrink-0"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
