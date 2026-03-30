import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

describe("baton workflow guidance", () => {
  it("treats in_review handoffs as actionable assignments in the Baton skill", async () => {
    const contents = await fs.readFile(path.join(REPO_ROOT, "skills", "baton", "SKILL.md"), "utf8");

    expect(contents).toContain("status=todo,in_progress,in_review,blocked");
    expect(contents).toContain("Work on `in_progress` first, then `in_review`, then `todo`.");
    expect(contents).toContain("If `BATON_TASK_ID` is set, fetch `GET /api/issues/{BATON_TASK_ID}` directly");
  });

  it("teaches CEOs to pick up in_review handoffs from their inbox", async () => {
    const contents = await fs.readFile(
      path.join(REPO_ROOT, "server", "src", "onboarding-assets", "ceo", "HEARTBEAT.md"),
      "utf8",
    );

    expect(contents).toContain("status=todo,in_progress,in_review,blocked");
    expect(contents).toContain("Prioritize: `in_progress` first, then `in_review`, then `todo`.");
    expect(contents).toContain("prioritize it even when it is currently `in_review`");
  });
});
