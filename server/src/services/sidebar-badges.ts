import { and, desc, eq, gte, inArray, not, sql } from "drizzle-orm";
import type { Db } from "@atototo/db";
import { agents, approvals, heartbeatRuns } from "@atototo/db";
import type { SidebarBadges } from "@atototo/shared";

const ACTIONABLE_APPROVAL_STATUSES = ["pending"];
const FAILED_HEARTBEAT_STATUSES = ["failed", "timed_out"];
const FAILED_RUN_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function sidebarBadgeService(db: Db) {
  return {
    get: async (
      companyId: string,
      extra?: { joinRequests?: number; assignedIssues?: number },
    ): Promise<SidebarBadges> => {
      const actionableApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            inArray(approvals.status, ACTIONABLE_APPROVAL_STATUSES),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0));

      const latestRunByAgent = await db
        .selectDistinctOn([heartbeatRuns.agentId], {
          runStatus: heartbeatRuns.status,
          createdAt: heartbeatRuns.createdAt,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            eq(agents.companyId, companyId),
            not(eq(agents.status, "terminated")),
            gte(heartbeatRuns.createdAt, new Date(Date.now() - FAILED_RUN_BADGE_WINDOW_MS)),
          ),
        )
        .orderBy(heartbeatRuns.agentId, desc(heartbeatRuns.createdAt));

      const failedRuns = latestRunByAgent.filter((row) =>
        FAILED_HEARTBEAT_STATUSES.includes(row.runStatus),
      ).length;

      const joinRequests = extra?.joinRequests ?? 0;
      const assignedIssues = extra?.assignedIssues ?? 0;
      return {
        inbox: actionableApprovals + failedRuns + joinRequests + assignedIssues,
        approvals: actionableApprovals,
        failedRuns,
        joinRequests,
      };
    },
  };
}
