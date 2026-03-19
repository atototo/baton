import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@atototo/adapter-utils";
import type { RunProcessResult } from "@atototo/adapter-utils/server-utils";

const mockedFns = vi.hoisted(() => ({
  runChildProcessMock: vi.fn(),
  ensureCommandResolvableMock: vi.fn(async () => {}),
}));

vi.mock("@atototo/adapter-utils/server-utils", async () => {
  const actual = await vi.importActual<typeof import("@atototo/adapter-utils/server-utils")>(
    "@atototo/adapter-utils/server-utils",
  );
  return {
    ...actual,
    ensureCommandResolvable: mockedFns.ensureCommandResolvableMock,
    runChildProcess: mockedFns.runChildProcessMock,
  };
});

import { execute } from "@atototo/adapter-claude-local/server";

function claudeResultJson(input: {
  subtype?: string;
  sessionId?: string | null;
  result: string;
  model?: string;
}) {
  const parts: string[] = [];
  if (input.sessionId) {
    parts.push(
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: input.sessionId,
        model: input.model ?? "claude-opus-4-6",
      }),
    );
  }
  parts.push(
    JSON.stringify({
      type: "result",
      subtype: input.subtype ?? "success",
      session_id: input.sessionId ?? undefined,
      usage: {
        input_tokens: 1,
        cache_read_input_tokens: 0,
        output_tokens: 1,
      },
      total_cost_usd: 0.01,
      result: input.result,
    }),
  );
  return `${parts.join("\n")}\n`;
}

function processResult(input: Partial<RunProcessResult> & { stdout?: string; stderr?: string }): RunProcessResult {
  return {
    exitCode: input.exitCode ?? 0,
    signal: input.signal ?? null,
    timedOut: input.timedOut ?? false,
    stdout: input.stdout ?? "",
    stderr: input.stderr ?? "",
  };
}

describe("claude_local execute overload retry", () => {
  beforeEach(() => {
    mockedFns.runChildProcessMock.mockReset();
    mockedFns.ensureCommandResolvableMock.mockClear();
  });

  it("retries a transient overloaded result and succeeds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "claude-overload-test-"));
    mockedFns.runChildProcessMock
      .mockResolvedValueOnce(
        processResult({
          exitCode: 1,
          stdout: claudeResultJson({
            result:
              'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
          }),
        }),
      )
      .mockResolvedValueOnce(
        processResult({
          exitCode: 0,
          stdout: claudeResultJson({
            sessionId: "session-1",
            result: "hello",
          }),
        }),
      );

    const logs: string[] = [];
    const ctx: AdapterExecutionContext = {
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "leader",
        adapterType: "claude_local",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: { cwd, command: "claude" },
      context: {},
      onLog: async (_stream, chunk) => {
        logs.push(chunk);
      },
      onMeta: async () => {},
    };

    const result = await execute(ctx);

    expect(mockedFns.runChildProcessMock).toHaveBeenCalledTimes(2);
    expect(result.errorMessage).toBeNull();
    expect(result.summary).toBe("hello");
    expect(logs.join("")).toContain("Claude provider overloaded; retrying");
  });
});
