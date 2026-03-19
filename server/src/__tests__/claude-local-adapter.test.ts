import { describe, expect, it } from "vitest";
import { isClaudeMaxTurnsResult, isClaudeOverloadedResult } from "@atototo/adapter-claude-local/server";

describe("claude_local max-turn detection", () => {
  it("detects max-turn exhaustion by subtype", () => {
    expect(
      isClaudeMaxTurnsResult({
        subtype: "error_max_turns",
        result: "Reached max turns",
      }),
    ).toBe(true);
  });

  it("detects max-turn exhaustion by stop_reason", () => {
    expect(
      isClaudeMaxTurnsResult({
        stop_reason: "max_turns",
      }),
    ).toBe(true);
  });

  it("returns false for non-max-turn results", () => {
    expect(
      isClaudeMaxTurnsResult({
        subtype: "success",
        stop_reason: "end_turn",
      }),
    ).toBe(false);
  });
});

describe("claude_local overload detection", () => {
  it("detects overloaded_error results", () => {
    expect(
      isClaudeOverloadedResult({
        parsed: {
          subtype: "success",
          result:
            'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
        },
      }),
    ).toBe(true);
  });

  it("returns false for non-overload failures", () => {
    expect(
      isClaudeOverloadedResult({
        parsed: {
          subtype: "success",
          result: "Please run `claude login` to continue.",
        },
      }),
    ).toBe(false);
  });
});
