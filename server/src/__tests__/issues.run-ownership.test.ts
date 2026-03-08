import { describe, expect, it } from "vitest";

import { issueRunOwnershipMatches } from "../services/issues.js";

describe("issueRunOwnershipMatches", () => {
  it("accepts the explicit checkout run owner", () => {
    expect(issueRunOwnershipMatches("run-1", "run-1", "run-1")).toBe(true);
  });

  it("accepts the execution run when checkoutRunId is missing", () => {
    expect(issueRunOwnershipMatches(null, "run-1", "run-1")).toBe(true);
  });

  it("rejects a different run when checkoutRunId is missing", () => {
    expect(issueRunOwnershipMatches(null, "run-1", "run-2")).toBe(false);
  });

  it("requires both locks to be absent when there is no actor run id", () => {
    expect(issueRunOwnershipMatches(null, null, null)).toBe(true);
    expect(issueRunOwnershipMatches(null, "run-1", null)).toBe(false);
  });
});
