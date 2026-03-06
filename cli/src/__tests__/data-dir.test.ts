import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDataDirOverride } from "../config/data-dir.js";

const ORIGINAL_ENV = { ...process.env };

describe("applyDataDirOverride", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BATON_HOME;
    delete process.env.BATON_CONFIG;
    delete process.env.BATON_CONTEXT;
    delete process.env.BATON_INSTANCE_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("sets BATON_HOME and isolated default config/context paths", () => {
    const home = applyDataDirOverride({
      dataDir: "~/baton-data",
      config: undefined,
      context: undefined,
    }, { hasConfigOption: true, hasContextOption: true });

    const expectedHome = path.resolve(os.homedir(), "baton-data");
    expect(home).toBe(expectedHome);
    expect(process.env.BATON_HOME).toBe(expectedHome);
    expect(process.env.BATON_CONFIG).toBe(
      path.resolve(expectedHome, "instances", "default", "config.json"),
    );
    expect(process.env.BATON_CONTEXT).toBe(path.resolve(expectedHome, "context.json"));
    expect(process.env.BATON_INSTANCE_ID).toBe("default");
  });

  it("uses the provided instance id when deriving default config path", () => {
    const home = applyDataDirOverride({
      dataDir: "/tmp/baton-alt",
      instance: "dev_1",
      config: undefined,
      context: undefined,
    }, { hasConfigOption: true, hasContextOption: true });

    expect(home).toBe(path.resolve("/tmp/baton-alt"));
    expect(process.env.BATON_INSTANCE_ID).toBe("dev_1");
    expect(process.env.BATON_CONFIG).toBe(
      path.resolve("/tmp/baton-alt", "instances", "dev_1", "config.json"),
    );
  });

  it("does not override explicit config/context settings", () => {
    process.env.BATON_CONFIG = "/env/config.json";
    process.env.BATON_CONTEXT = "/env/context.json";

    applyDataDirOverride({
      dataDir: "/tmp/baton-alt",
      config: "/flag/config.json",
      context: "/flag/context.json",
    }, { hasConfigOption: true, hasContextOption: true });

    expect(process.env.BATON_CONFIG).toBe("/env/config.json");
    expect(process.env.BATON_CONTEXT).toBe("/env/context.json");
  });

  it("only applies defaults for options supported by the command", () => {
    applyDataDirOverride(
      {
        dataDir: "/tmp/baton-alt",
      },
      { hasConfigOption: false, hasContextOption: false },
    );

    expect(process.env.BATON_HOME).toBe(path.resolve("/tmp/baton-alt"));
    expect(process.env.BATON_CONFIG).toBeUndefined();
    expect(process.env.BATON_CONTEXT).toBeUndefined();
  });
});
