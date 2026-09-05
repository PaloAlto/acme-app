import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function repo(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "acme-git-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ["src", "lab", ".gitignore"])
    cpSync(join(source, path), join(root, path), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Acme Test");
  git("config", "user.email", "test@acme.example");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  // Every isolated test starts with the catalog's baseline, even when testing an applied scenario.
  const state = JSON.parse(
    readFileSync(join(root, "lab/state.json"), "utf8"),
  ).scenario;
  if (state !== "baseline") {
    const scenario = JSON.parse(
      readFileSync(join(root, "lab/catalog.json"), "utf8"),
    ).find((s: { id: string }) => s.id === state);
    for (const edit of [...scenario.edits].reverse()) {
      const file = join(root, edit.file);
      writeFileSync(
        file,
        readFileSync(file, "utf8").split(edit.after).join(edit.before),
      );
    }
    writeFileSync(join(root, "lab/state.json"), '{"scenario":"baseline"}\n');
  }
  git("add", ".");
  git("commit", "-m", "Baseline");
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["lab/cli.ts", ...args], {
      cwd: root,
      encoding: "utf8",
    });
  return { root, git, cli };
}

for (const scenario of [
  "rename-control",
  "forecast-export",
  "internal-refactor",
]) {
  test(`${scenario}: preview, real commit, restore, repeat with new SHA`, (t) => {
    const { root, git, cli } = repo(t);
    const baseline = readFileSync(
      join(root, "src/pages/dashboard.html"),
      "utf8",
    );
    const initial = git("rev-parse", "HEAD");
    assert.equal(cli("preview", scenario).status, 0);
    assert.equal(git("status", "--porcelain"), "");
    const applied = cli("apply", scenario);
    assert.equal(applied.status, 0, applied.stderr);
    const first = git("rev-parse", "HEAD");
    assert.notEqual(first, initial);
    assert.match(
      git("show", "--format=", "--name-only", "HEAD"),
      /src\/pages\/dashboard.html/,
    );
    assert.equal(cli("apply", scenario).status, 1);
    const restored = cli("restore", "baseline");
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(
      readFileSync(join(root, "src/pages/dashboard.html"), "utf8"),
      baseline,
    );
    assert.equal(cli("apply", scenario).status, 0);
    assert.notEqual(git("rev-parse", "HEAD"), first);
    const records = readdirSync(join(root, ".lab/runs")).map((file) =>
      JSON.parse(readFileSync(join(root, ".lab/runs", file), "utf8")),
    );
    assert.equal(records.length, 3);
    assert.ok(
      records.every(
        (r) => r.before && r.after && r.expected && r.status === "committed",
      ),
    );
  });
}

test("dirty checkout, stale catalog, and concurrent mutation fail without overwriting work", (t) => {
  const { root, git, cli } = repo(t);
  const path = join(root, "src/pages/dashboard.html");
  writeFileSync(path, "User changes");
  assert.equal(cli("apply", "rename-control").status, 1);
  assert.equal(readFileSync(path, "utf8"), "User changes");
  git("add", ".");
  git("commit", "-m", "Change baseline");
  assert.match(cli("apply", "rename-control").stderr, /no longer matches/);
  assert.equal(git("status", "--porcelain"), "");
  mkdirSync(join(root, ".lab/lock"));
  assert.match(cli("apply", "rename-control").stderr, /Another lab command/);
});

test("publish refuses other remotes before making a network request", (t) => {
  const { git, cli } = repo(t);
  assert.equal(cli("apply", "rename-control").status, 0);
  git("remote", "add", "origin", "https://github.com/example/other.git");
  assert.match(cli("publish").stderr, /restricted to origin/);
});

test("observe records deployed revision and manual outcome, and rejects stale or dirty deployments", async (t) => {
  const { root, git, cli } = repo(t);
  assert.equal(cli("apply", "rename-control").status, 0);
  const sha = git("rev-parse", "HEAD");
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  let version = {
    sha: "old",
    startedSha: "old",
    dirty: false,
    restartRequired: false,
  };
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(version));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const observe = () =>
    new Promise<number | null>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["lab/cli.ts", "observe", "--url", url, "--outcome", "Card reviewed"],
        { cwd: root, stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("exit", resolve);
    });
  assert.equal(await observe(), 2);
  version = { sha, startedSha: "old", dirty: false, restartRequired: true };
  assert.equal(await observe(), 2);
  version = { sha, startedSha: sha, dirty: true, restartRequired: false };
  assert.equal(await observe(), 2);
  version.dirty = false;
  assert.equal(await observe(), 0);
  const records = readdirSync(join(root, ".lab/runs"));
  const run = JSON.parse(
    readFileSync(join(root, ".lab/runs", records[0]), "utf8"),
  );
  assert.equal(run.observations.length, 4);
  assert.equal(run.observations[3].driftlessOutcome, "Card reviewed");
  assert.equal(run.observations[3].ready, true);
});
