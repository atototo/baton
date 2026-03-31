import { describe, expect, it } from "vitest";
import {
  buildExecutionWorkspacePlanForIssue,
  deriveExecutionBranch,
  extractExplicitBranch,
  extractJiraTicketKey,
  normalizeExecutionTicketKey,
  parseExecutionWorkspacePlan,
} from "../services/execution-workspaces.js";

describe("execution workspace helpers", () => {
  it("extracts and normalizes Jira ticket keys from freeform text", () => {
    expect(
      extractJiraTicketKey(
        "billing: jira-321",
        "Implement API changes for Jira-321",
        "References JIRA-999 but billing code should win",
      ),
    ).toBe("JIRA-321");
  });

  it("returns null when no Jira ticket is present", () => {
    expect(extractJiraTicketKey("no ticket here", "still nothing")).toBeNull();
  });

  it("prefers explicit branch directives over derived feature branches", () => {
    expect(
      deriveExecutionBranch({
        ticketKey: "JIRA-123",
        explicitBranch: extractExplicitBranch("Please use branch feature/custom-jira-123"),
      }),
    ).toBe("feature/custom-jira-123");
  });

  it("derives feature branch names from Jira tickets when no explicit branch exists", () => {
    expect(deriveExecutionBranch({ ticketKey: "JIRA-123" })).toBe("feature/JIRA-123");
  });

  it("parses nested execution workspace plans from approval payloads", () => {
    expect(
      parseExecutionWorkspacePlan({
        summary: "request approval",
        workspace: {
          ownerIssueId: "issue-1",
          projectId: "project-1",
          projectWorkspaceId: "workspace-1",
          projectWorkspaceName: "Main Repo",
          sourceRepoCwd: "/tmp/source",
          ticketKey: "jira-123",
          baseBranch: "main",
          branch: "feature/JIRA-123",
        },
      }),
    ).toEqual({
      ownerIssueId: "issue-1",
      projectId: "project-1",
      projectWorkspaceId: "workspace-1",
      projectWorkspaceName: "Main Repo",
      sourceRepoCwd: "/tmp/source",
      ticketKey: "JIRA-123",
      baseBranch: "main",
      branch: "feature/JIRA-123",
    });
  });

  it("rejects malformed execution workspace payloads", () => {
    expect(
      parseExecutionWorkspacePlan({
        workspace: {
          ticketKey: normalizeExecutionTicketKey("jira-123"),
        },
      }),
    ).toBeNull();
  });

  it("builds an execution workspace plan from an issue and project workspaces", () => {
    expect(
      buildExecutionWorkspacePlanForIssue({
        issue: {
          id: "issue-1",
          projectId: "project-1",
          billingCode: null,
          title: "Implement AZAK-001 docs",
          description: "Use feature/custom-azak-001",
          identifier: "DOB-33",
        },
        projectWorkspaces: [
          {
            id: "workspace-1",
            name: "azak",
            cwd: "/tmp/azak",
            defaultBaseBranch: "main",
          },
        ],
      }),
    ).toEqual({
      ownerIssueId: "issue-1",
      projectId: "project-1",
      projectWorkspaceId: "workspace-1",
      projectWorkspaceName: "azak",
      sourceRepoCwd: "/tmp/azak",
      ticketKey: "AZAK-001",
      baseBranch: "main",
      branch: "feature/custom-azak-001",
    });
  });

  it("prefers the current issue identifier over referenced tickets in the description", () => {
    expect(
      buildExecutionWorkspacePlanForIssue({
        issue: {
          id: "issue-2",
          projectId: "project-1",
          billingCode: null,
          title: "workflow 탭을 사람이 이해 가능한 flow UI로 재설계",
          description:
            "실제 검증 케이스: DOB-187\n검증 방법: 실제 이슈 DOB-187로 흐름을 검증합니다.",
          identifier: "DOB-191",
        },
        projectWorkspaces: [
          {
            id: "workspace-1",
            name: "baton-dashboard",
            cwd: "/tmp/baton-dashboard",
            defaultBaseBranch: "main",
          },
        ],
      }),
    ).toEqual({
      ownerIssueId: "issue-2",
      projectId: "project-1",
      projectWorkspaceId: "workspace-1",
      projectWorkspaceName: "baton-dashboard",
      sourceRepoCwd: "/tmp/baton-dashboard",
      ticketKey: "DOB-191",
      baseBranch: "main",
      branch: "feature/DOB-191",
    });
  });
});
