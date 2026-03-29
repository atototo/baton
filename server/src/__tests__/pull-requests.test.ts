import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { pullRequestService } from "../services/pull-requests.js";

const execFile = promisify(execFileCb);

async function runGit(cwd: string, args: string[]) {
  return execFile("git", args, { cwd });
}

async function createRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "baton-pr-sync-"));
  const bareDir = path.join(root, "origin.git");
  const repoDir = path.join(root, "repo");

  await fs.mkdir(bareDir, { recursive: true });
  await fs.mkdir(repoDir, { recursive: true });

  await runGit(bareDir, ["init", "--bare"]);
  await runGit(repoDir, ["init", "-b", "main"]);
  await runGit(repoDir, ["config", "user.name", "baton"]);
  await runGit(repoDir, ["config", "user.email", "baton@example.com"]);
  await fs.writeFile(path.join(repoDir, "README.md"), "# test\n", "utf8");
  await runGit(repoDir, ["add", "README.md"]);
  await runGit(repoDir, ["commit", "-m", "init"]);
  await runGit(repoDir, ["remote", "add", "origin", bareDir]);
  await runGit(repoDir, ["push", "-u", "origin", "main"]);

  return { root, bareDir, repoDir };
}

async function cloneWorktree(originDir: string, targetDir: string) {
  await runGit(path.dirname(targetDir), ["clone", originDir, targetDir]);
  await runGit(targetDir, ["config", "user.name", "baton"]);
  await runGit(targetDir, ["config", "user.email", "baton@example.com"]);
}

describe("pullRequestService.prepareForPullRequest", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  it("merges the latest base branch into the feature branch before PR creation", async () => {
    const { root, bareDir, repoDir } = await createRepo();
    tempRoots.push(root);

    await runGit(repoDir, ["checkout", "-b", "feature/AZAK-1"]);
    await fs.writeFile(path.join(repoDir, "feature.txt"), "feature\n", "utf8");
    await runGit(repoDir, ["add", "feature.txt"]);
    await runGit(repoDir, ["commit", "-m", "feature work"]);

    const updaterDir = path.join(root, "updater");
    await cloneWorktree(bareDir, updaterDir);
    await runGit(updaterDir, ["checkout", "main"]);
    await fs.writeFile(path.join(updaterDir, "base.txt"), "base\n", "utf8");
    await runGit(updaterDir, ["add", "base.txt"]);
    await runGit(updaterDir, ["commit", "-m", "base update"]);
    await runGit(updaterDir, ["push", "origin", "main"]);

    const svc = pullRequestService();
    const result = await svc.prepareForPullRequest({
      cwd: repoDir,
      branch: "feature/AZAK-1",
      baseBranch: "main",
    });

    expect(result.syncStatus).toBe("verified");
    expect(result.conflictSummary).toBeNull();
    expect(result.changedPaths).toContain("feature.txt");

    const { stdout: mergedBase } = await runGit(repoDir, ["show", "--stat", "--oneline", "HEAD"]);
    expect(mergedBase).toContain("base.txt");
  });

  it("captures conflicted paths when sync fails", async () => {
    const { root, bareDir, repoDir } = await createRepo();
    tempRoots.push(root);

    await fs.writeFile(path.join(repoDir, "shared.txt"), "feature-version\n", "utf8");
    await runGit(repoDir, ["add", "shared.txt"]);
    await runGit(repoDir, ["commit", "-m", "shared base"]);
    await runGit(repoDir, ["push", "origin", "main"]);

    await runGit(repoDir, ["checkout", "-b", "feature/AZAK-2"]);
    await fs.writeFile(path.join(repoDir, "shared.txt"), "feature-change\n", "utf8");
    await runGit(repoDir, ["add", "shared.txt"]);
    await runGit(repoDir, ["commit", "-m", "feature change"]);

    const updaterDir = path.join(root, "conflict-updater");
    await cloneWorktree(bareDir, updaterDir);
    await runGit(updaterDir, ["checkout", "main"]);
    await fs.writeFile(path.join(updaterDir, "shared.txt"), "base-change\n", "utf8");
    await runGit(updaterDir, ["add", "shared.txt"]);
    await runGit(updaterDir, ["commit", "-m", "base change"]);
    await runGit(updaterDir, ["push", "origin", "main"]);

    const svc = pullRequestService();
    const result = await svc.prepareForPullRequest({
      cwd: repoDir,
      branch: "feature/AZAK-2",
      baseBranch: "main",
    });

    expect(result.syncStatus).toBe("conflicted");
    expect(result.conflictSummary).toMatchObject({
      phase: "merge",
      baseBranch: "main",
      branch: "feature/AZAK-2",
    });
    expect(result.conflictSummary?.conflictedPaths).toContain("shared.txt");

    const { stdout: status } = await runGit(repoDir, ["status", "--porcelain"]);
    expect(status.trim()).toBe("");
  });

  it("detects drift after the base branch moves post-pr", async () => {
    const { root, bareDir, repoDir } = await createRepo();
    tempRoots.push(root);

    await runGit(repoDir, ["checkout", "-b", "feature/AZAK-3"]);
    await fs.writeFile(path.join(repoDir, "feature-3.txt"), "feature 3\n", "utf8");
    await runGit(repoDir, ["add", "feature-3.txt"]);
    await runGit(repoDir, ["commit", "-m", "feature work"]);

    const svc = pullRequestService();
    const prepared = await svc.prepareForPullRequest({
      cwd: repoDir,
      branch: "feature/AZAK-3",
      baseBranch: "main",
    });

    const updaterDir = path.join(root, "drift-updater");
    await cloneWorktree(bareDir, updaterDir);
    await runGit(updaterDir, ["checkout", "main"]);
    await fs.writeFile(path.join(updaterDir, "base-drift.txt"), "base drift\n", "utf8");
    await runGit(updaterDir, ["add", "base-drift.txt"]);
    await runGit(updaterDir, ["commit", "-m", "base drift"]);
    await runGit(updaterDir, ["push", "origin", "main"]);

    const drift = await svc.inspectPullRequestDrift({
      cwd: repoDir,
      branch: "feature/AZAK-3",
      baseBranch: "main",
      storedBaseCommitSha: prepared.baseCommitSha,
    });

    expect(drift.drifted).toBe(true);
    expect(drift.latestBaseCommitSha).not.toBe(prepared.baseCommitSha);
  });
});
