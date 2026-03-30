import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@atototo/db";
import { issueWorkflowSessions, issues } from "@atototo/db";
import { notFound } from "../errors.js";

export function issueWorkflowSessionService(db: Db) {
  async function getIssue(issueId: string) {
    return db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
  }

  async function getSession(id: string) {
    return db
      .select()
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, id))
      .then((rows) => rows[0] ?? null);
  }

  return {
    getById: async (id: string) => {
      const session = await getSession(id);
      if (!session) throw notFound("Issue workflow session not found");
      return session;
    },

    listForIssue: async (issueId: string) => {
      const issue = await getIssue(issueId);
      if (!issue) throw notFound("Issue not found");
      return db
        .select()
        .from(issueWorkflowSessions)
        .where(eq(issueWorkflowSessions.issueId, issueId))
        .orderBy(desc(issueWorkflowSessions.createdAt));
    },

    getActiveForIssue: async (issueId: string) => {
      const issue = await getIssue(issueId);
      if (!issue) throw notFound("Issue not found");
      if (!issue.activeWorkflowSessionId) return null;
      return (
        await db
          .select()
          .from(issueWorkflowSessions)
          .where(eq(issueWorkflowSessions.id, issue.activeWorkflowSessionId))
      )[0] ?? null;
    },

    getByApprovalId: async (approvalId: string) =>
      (
        await db
          .select()
          .from(issueWorkflowSessions)
          .where(eq(issueWorkflowSessions.approvalId, approvalId))
      )[0] ?? null,

    findReusableSession: async (args: {
      issueId: string;
      epoch: number;
      kind: string;
      fingerprint: string;
      statuses?: string[];
    }) => {
      const {
        issueId,
        epoch,
        kind,
        fingerprint,
        statuses = ["open", "revision_requested", "approved", "consumed"],
      } = args;
      const issue = await getIssue(issueId);
      if (!issue) throw notFound("Issue not found");
      return (
        await db
          .select()
          .from(issueWorkflowSessions)
          .where(
            and(
              eq(issueWorkflowSessions.issueId, issueId),
              eq(issueWorkflowSessions.issueWorkflowEpoch, epoch),
              eq(issueWorkflowSessions.kind, kind),
              eq(issueWorkflowSessions.fingerprint, fingerprint),
              inArray(issueWorkflowSessions.status, statuses),
            ),
          )
          .orderBy(desc(issueWorkflowSessions.createdAt))
      )[0] ?? null;
    },

    create: async (data: typeof issueWorkflowSessions.$inferInsert) =>
      db
        .insert(issueWorkflowSessions)
        .values({
          ...data,
          updatedAt: data.updatedAt ?? new Date(),
        })
        .returning()
        .then((rows) => rows[0]),

    update: async (
      id: string,
      patch: Partial<typeof issueWorkflowSessions.$inferInsert>,
    ) =>
      db
        .update(issueWorkflowSessions)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(issueWorkflowSessions.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    markApproved: async (id: string, approvalId?: string | null) =>
      db
        .update(issueWorkflowSessions)
        .set({
          status: "approved",
          approvalId: approvalId ?? undefined,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(issueWorkflowSessions.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    markConsumed: async (
      id: string,
      patch?: Partial<typeof issueWorkflowSessions.$inferInsert>,
    ) =>
      db
        .update(issueWorkflowSessions)
        .set({
          ...(patch ?? {}),
          status: "consumed",
          consumedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(issueWorkflowSessions.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    markRevisionRequested: async (
      id: string,
      patch?: Partial<typeof issueWorkflowSessions.$inferInsert>,
    ) =>
      db
        .update(issueWorkflowSessions)
        .set({
          ...(patch ?? {}),
          status: "revision_requested",
          updatedAt: new Date(),
        })
        .where(eq(issueWorkflowSessions.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    markRejected: async (
      id: string,
      patch?: Partial<typeof issueWorkflowSessions.$inferInsert>,
    ) =>
      db
        .update(issueWorkflowSessions)
        .set({
          ...(patch ?? {}),
          status: "rejected",
          updatedAt: new Date(),
        })
        .where(eq(issueWorkflowSessions.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    markObsolete: async (id: string, supersededBySessionId?: string | null) =>
      db
        .update(issueWorkflowSessions)
        .set({
          status: "obsolete",
          supersededBySessionId: supersededBySessionId ?? undefined,
          obsoletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(issueWorkflowSessions.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),
  };
}
