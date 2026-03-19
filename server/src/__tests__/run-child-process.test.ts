import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { runChildProcess } from "@atototo/adapter-utils/server-utils";

function makeChildThatErrors(code: string) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: null;
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = null;
  child.killed = false;
  child.kill = vi.fn((signal?: string) => {
    child.killed = true;
    return signal !== undefined;
  });
  queueMicrotask(() => {
    const err = Object.assign(new Error(`spawn ${code}`), { code });
    child.emit("error", err);
  });
  return child;
}

function makeChildThatCloses() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: null;
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = null;
  child.killed = false;
  child.kill = vi.fn((signal?: string) => {
    child.killed = true;
    return signal !== undefined;
  });
  queueMicrotask(() => {
    child.emit("close", 0, null);
  });
  return child;
}

describe("runChildProcess transient spawn retry", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("retries transient EBADF spawn failures and eventually succeeds", async () => {
    spawnMock
      .mockImplementationOnce(() => makeChildThatErrors("EBADF"))
      .mockImplementationOnce(() => makeChildThatCloses());

    const result = await runChildProcess("run-1", "codex", ["exec", "-"], {
      cwd: process.cwd(),
      env: {},
      timeoutSec: 0,
      graceSec: 1,
      onLog: async () => {},
    });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });
});
