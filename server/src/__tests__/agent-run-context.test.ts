import { describe, expect, it } from "vitest";
import { inferIssueIdForManualAgentInvoke } from "../routes/agent-run-context.js";

describe("inferIssueIdForManualAgentInvoke", () => {
  it("prefers a single execution-workspace-linked issue", () => {
    expect(
      inferIssueIdForManualAgentInvoke([
        { id: "issue-1", status: "todo", executionWorkspaceId: "workspace-1" },
        { id: "issue-2", status: "todo", executionWorkspaceId: null },
      ]),
    ).toBe("issue-1");
  });

  it("returns the only actionable issue when there is just one", () => {
    expect(
      inferIssueIdForManualAgentInvoke([
        { id: "issue-1", status: "blocked", executionWorkspaceId: null },
      ]),
    ).toBe("issue-1");
  });

  it("returns null when multiple actionable issues are still ambiguous", () => {
    expect(
      inferIssueIdForManualAgentInvoke([
        { id: "issue-1", status: "todo", executionWorkspaceId: null },
        { id: "issue-2", status: "in_progress", executionWorkspaceId: null },
      ]),
    ).toBeNull();
  });
});
