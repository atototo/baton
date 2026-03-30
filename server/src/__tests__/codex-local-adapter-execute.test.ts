import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@atototo/adapter-utils";

let capturedRunChildOptions: { env: Record<string, string> } | null = null;

const {
  ensureCommandResolvableMock,
  runChildProcessMock,
} = vi.hoisted(() => ({
  ensureCommandResolvableMock: vi.fn(async () => {}),
  runChildProcessMock: vi.fn(
    async (_runId: string, _command: string, _args: string[], opts: { env: Record<string, string> }) => {
      capturedRunChildOptions = opts;
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "hello" } }),
          JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
        ].join("\n"),
        stderr: "",
      };
    },
  ),
}));

vi.mock("@atototo/adapter-utils/server-utils", async () => {
  const actual = await vi.importActual<typeof import("@atototo/adapter-utils/server-utils")>(
    "@atototo/adapter-utils/server-utils",
  );
  return {
    ...actual,
    ensureCommandResolvable: ensureCommandResolvableMock,
    runChildProcess: runChildProcessMock,
  };
});

import { execute } from "@atototo/adapter-codex-local/server";

function makeContext(config: Record<string, unknown>): AdapterExecutionContext {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "dashboard-leader",
      adapterType: "codex_local",
      adapterConfig: config,
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config,
    context: {},
    onLog: async () => {},
    authToken: "jwt-token",
  };
}

describe("codex_local execute", () => {
  let tempRoot = "";
  let previousBatonHome: string | undefined;
  let previousInstanceId: string | undefined;
  let previousCodexHome: string | undefined;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-codex-execute-"));
    previousBatonHome = process.env.BATON_HOME;
    previousInstanceId = process.env.BATON_INSTANCE_ID;
    previousCodexHome = process.env.CODEX_HOME;
    process.env.BATON_HOME = path.join(tempRoot, ".baton-home");
    process.env.BATON_INSTANCE_ID = "test";
    delete process.env.CODEX_HOME;
    capturedRunChildOptions = null;
    ensureCommandResolvableMock.mockClear();
    runChildProcessMock.mockClear();
  });

  afterEach(async () => {
    if (previousBatonHome === undefined) delete process.env.BATON_HOME;
    else process.env.BATON_HOME = previousBatonHome;
    if (previousInstanceId === undefined) delete process.env.BATON_INSTANCE_ID;
    else process.env.BATON_INSTANCE_ID = previousInstanceId;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses an isolated CODEX_HOME under BATON_HOME by default", async () => {
    const cwd = path.join(tempRoot, "workspace");
    await fs.mkdir(cwd, { recursive: true });

    await execute(
      makeContext({
        command: "codex",
        cwd,
      }),
    );

    const expectedCodexHome = path.join(
      process.env.BATON_HOME!,
      "instances",
      "test",
      "companies",
      "company-1",
      "agents",
      "agent-1",
      "codex-home",
    );

    expect(capturedRunChildOptions?.env.CODEX_HOME).toBe(expectedCodexHome);
    const batonSkillLink = await fs.lstat(path.join(expectedCodexHome, "skills", "baton"));
    expect(batonSkillLink.isSymbolicLink()).toBe(true);
  });

  it("honors an explicit adapter CODEX_HOME override", async () => {
    const cwd = path.join(tempRoot, "workspace");
    const explicitCodexHome = path.join(tempRoot, "custom-codex-home");
    await fs.mkdir(cwd, { recursive: true });

    await execute(
      makeContext({
        command: "codex",
        cwd,
        env: {
          CODEX_HOME: explicitCodexHome,
        },
      }),
    );

    expect(capturedRunChildOptions?.env.CODEX_HOME).toBe(explicitCodexHome);
    const batonSkillLink = await fs.lstat(path.join(explicitCodexHome, "skills", "baton"));
    expect(batonSkillLink.isSymbolicLink()).toBe(true);
  });
});
