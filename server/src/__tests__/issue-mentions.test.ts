import { describe, expect, it } from "vitest";
import { extractMentionedAgentIds } from "../services/issue-mentions.js";

describe("extractMentionedAgentIds", () => {
  it("matches multi-word agent names in plain text mentions", () => {
    const ids = extractMentionedAgentIds(
      "Need input from @Team Lead and @Founding Engineer today.",
      [
        { id: "agent-1", name: "Team Lead" },
        { id: "agent-2", name: "Founding Engineer" },
      ],
    );

    expect(ids).toEqual(["agent-1", "agent-2"]);
  });

  it("matches mentions at the start of the body", () => {
    const ids = extractMentionedAgentIds("@Founding Engineer please take this.", [
      { id: "agent-1", name: "Founding Engineer" },
    ]);

    expect(ids).toEqual(["agent-1"]);
  });

  it("does not match partial prefixes of longer names", () => {
    const ids = extractMentionedAgentIds("@Team needs review.", [
      { id: "agent-1", name: "Team" },
      { id: "agent-2", name: "Team Lead" },
    ]);

    expect(ids).toEqual(["agent-1"]);
  });

  it("returns every agent id when duplicate names are mentioned", () => {
    const ids = extractMentionedAgentIds("@Reviewer please check.", [
      { id: "agent-1", name: "Reviewer" },
      { id: "agent-2", name: "Reviewer" },
    ]);

    expect(ids).toEqual(["agent-1", "agent-2"]);
  });
});
