import { describe, expect, it } from "vitest";
import { sanitizeProjectWorkspacePaths } from "../routes/issue-response.js";

describe("sanitizeProjectWorkspacePaths", () => {
  it("removes cwd from project workspaces while preserving other fields", () => {
    expect(
      sanitizeProjectWorkspacePaths({
        id: "project-1",
        name: "azak",
        workspaces: [
          { id: "w1", cwd: "/tmp/source", repoUrl: "git@example.com/repo.git" },
          { id: "w2", cwd: null, repoUrl: null },
        ],
        primaryWorkspace: { id: "w1", cwd: "/tmp/source", repoUrl: "git@example.com/repo.git" },
      }),
    ).toEqual({
      id: "project-1",
      name: "azak",
      workspaces: [
        { id: "w1", cwd: null, repoUrl: "git@example.com/repo.git" },
        { id: "w2", cwd: null, repoUrl: null },
      ],
      primaryWorkspace: { id: "w1", cwd: null, repoUrl: "git@example.com/repo.git" },
    });
  });

  it("returns null unchanged", () => {
    expect(sanitizeProjectWorkspacePaths(null)).toBeNull();
  });
});
