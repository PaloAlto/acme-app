import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

type Edit = { file: string; before: string; after: string; count: number };
type Scenario = {
  id: string;
  message: string;
  expected: string;
  edits: Edit[];
};
type Run = {
  id: string;
  scenario: string;
  action: string;
  expected: string;
  before: string;
  after?: string;
  createdAt: string;
  status: string;
  published?: { remote: string; branch: string; at: string };
  observations: unknown[];
  error?: string;
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lab = join(root, ".lab");
const runs = join(lab, "runs");
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const catalog: Scenario[] = JSON.parse(
  readFileSync(join(root, "lab/catalog.json"), "utf8"),
);
const current = () =>
  JSON.parse(readFileSync(join(root, "lab/state.json"), "utf8"))
    .scenario as string;
const head = () => git("rev-parse", "HEAD");
const save = (run: Run) =>
  writeFileSync(
    join(runs, `${run.id}.json`),
    JSON.stringify(run, null, 2) + "\n",
  );
const allRuns = (): Run[] =>
  readdirSync(runs)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(runs, name), "utf8")));
const clean = () => {
  if (git("status", "--porcelain"))
    throw new Error(
      "Checkout is dirty. Commit or move your changes before running the lab.",
    );
};
function plan(id: string, reverse = false) {
  const scenario = catalog.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}. Run pnpm lab list.`);
  const files = new Map<string, string>();
  const edits = reverse ? [...scenario.edits].reverse() : scenario.edits;
  for (const edit of edits) {
    if (!edit.file.startsWith("src/") || edit.file.includes(".."))
      throw new Error("Scenario edits must be under src/.");
    const text =
      files.get(edit.file) ?? readFileSync(join(root, edit.file), "utf8");
    const from = reverse ? edit.after : edit.before;
    const to = reverse ? edit.before : edit.after;
    if (!from || text.split(from).length - 1 !== edit.count)
      throw new Error(
        `Scenario no longer matches ${edit.file}; no files changed. Update the catalog against the baseline.`,
      );
    files.set(edit.file, text.split(from).join(to));
  }
  return { scenario, files };
}
function preview(files: Map<string, string>) {
  const scratch = mkdtempSync(join(tmpdir(), "acme-preview-"));
  try {
    for (const [file, content] of files) {
      const before = join(scratch, "before");
      const after = join(scratch, "after");
      writeFileSync(before, readFileSync(join(root, file)));
      writeFileSync(after, content);
      const diff = spawnSync(
        "git",
        ["diff", "--no-index", "--", before, after],
        { encoding: "utf8" },
      );
      if (diff.status !== 0 && diff.status !== 1) throw new Error(diff.stderr);
      console.log(`\n${file}\n${diff.stdout}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
function mutate(id: string, reverse: boolean) {
  clean();
  const state = current();
  if (reverse ? state === "baseline" : state !== "baseline")
    throw new Error(
      reverse
        ? "Already at baseline."
        : `Restore ${state} to baseline before applying another scenario.`,
    );
  const { scenario, files } = plan(reverse ? state : id, reverse);
  const run: Run = {
    id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
    scenario: scenario.id,
    action: reverse ? "restore" : "apply",
    expected: reverse
      ? `Restore baseline behavior; previously published documentation may need to be reverted. Original scenario: ${scenario.expected}`
      : scenario.expected,
    before: head(),
    createdAt: new Date().toISOString(),
    status: "prepared",
    observations: [],
  };
  save(run);
  try {
    for (const [file, content] of files)
      writeFileSync(join(root, file), content);
    writeFileSync(
      join(root, "lab/state.json"),
      JSON.stringify({ scenario: reverse ? "baseline" : id }, null, 2) + "\n",
    );
    git("add", "--", ...files.keys(), "lab/state.json");
    const message = reverse
      ? `Restore baseline after ${scenario.message}`
      : scenario.message;
    git(
      "commit",
      "-m",
      message,
      "-m",
      `Acme-Lab-Run: ${run.id}\n\nCo-Authored-By: Codex <noreply@openai.com>`,
    );
    run.after = head();
    run.status = "committed";
    save(run);
    console.log(JSON.stringify(run, null, 2));
  } catch (error) {
    run.status = "failed";
    run.error = (error as Error).message;
    save(run);
    throw new Error(
      `Run ${run.id} failed. Edits are retained for inspection; no reset was attempted.\n${run.error}`,
    );
  }
}
function latest() {
  const run = allRuns().findLast((r) => r.after === head());
  if (!run)
    throw new Error(
      "HEAD does not match a recorded lab run. Apply or restore a scenario first.",
    );
  return run;
}
function publish() {
  clean();
  const run = latest();
  const branch = git("branch", "--show-current");
  if (branch !== "main")
    throw new Error(
      "Publish requires main; Driftless listens to the default branch.",
    );
  const remote = git("remote", "get-url", "origin");
  if (
    !/^(https:\/\/github\.com\/PaloAlto\/acme-app(?:\.git)?|git@github\.com:PaloAlto\/acme-app(?:\.git)?)$/.test(
      remote,
    )
  )
    throw new Error("Publish is restricted to origin PaloAlto/acme-app.");
  git("fetch", "origin", "main");
  const remoteHead = git("rev-parse", "refs/remotes/origin/main");
  git("merge-base", "--is-ancestor", remoteHead, head());
  const pending = git("rev-list", "--reverse", `${remoteHead}..HEAD`)
    .split("\n")
    .filter(Boolean);
  const recorded = new Set(allRuns().map((r) => r.after));
  if (pending.some((sha) => !recorded.has(sha)))
    throw new Error(
      "Unpublished non-lab commits exist. Review and publish the implementation separately before using lab publish.",
    );
  if (pending.length > 1)
    throw new Error(
      "More than one unpublished lab commit exists. Publish each change before restoring; otherwise intermediate UI revisions are never deployed.",
    );
  if (pending.length) {
    console.log(
      `Publishing ${head()} to ${remote} main. Every connected Driftless environment can receive this push.`,
    );
    git("push", "origin", "HEAD:refs/heads/main");
  }
  run.published = { remote, branch, at: new Date().toISOString() };
  save(run);
  console.log(
    `Published ${run.after}. Use lab observe --url <acme-url> to check the deployed revision.`,
  );
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const [command, argument] = args;
const option = (name: string) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
mkdirSync(runs, { recursive: true });
let locked = false;
try {
  if (["apply", "restore", "publish", "observe"].includes(command)) {
    try {
      mkdirSync(join(lab, "lock"));
      locked = true;
    } catch {
      throw new Error(
        "Another lab command is running. If a process was killed, inspect the checkout and remove .lab/lock before retrying.",
      );
    }
  }
  switch (command) {
    case "list":
      for (const scenario of catalog)
        console.log(
          `${scenario.id}\n  ${scenario.message}\n  Expect: ${scenario.expected}`,
        );
      break;
    case "preview": {
      const reverse = argument === "baseline";
      if (!reverse && current() !== "baseline")
        throw new Error("Restore baseline before previewing another scenario.");
      const { scenario, files } = plan(reverse ? current() : argument, reverse);
      console.log(
        `${reverse ? "Restore: " : ""}${scenario.message}\nExpect: ${scenario.expected}`,
      );
      preview(files);
      break;
    }
    case "apply":
      mutate(argument, false);
      break;
    case "restore":
      if (argument !== "baseline")
        throw new Error("Use pnpm lab restore baseline.");
      mutate(current(), true);
      break;
    case "publish":
      publish();
      break;
    case "status":
      console.log(
        JSON.stringify(
          {
            scenario: current(),
            sha: head(),
            dirty: Boolean(git("status", "--porcelain")),
            runs: allRuns(),
          },
          null,
          2,
        ),
      );
      break;
    case "observe": {
      const base = option("--url");
      if (!base)
        throw new Error(
          'Use pnpm lab observe --url <acme-url> [--outcome "what Driftless did"].',
        );
      const url = new URL("/api/version", base);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Use an HTTP(S) URL without credentials.");
      const run = latest();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`Version endpoint returned ${response.status}`);
      const version = await response.json();
      const ready =
        version.sha === run.after &&
        version.startedSha === run.after &&
        version.dirty === false &&
        version.restartRequired === false;
      const observation = {
        at: new Date().toISOString(),
        url: url.origin,
        version,
        ready,
        driftlessOutcome: option("--outcome") ?? null,
      };
      run.observations.push(observation);
      save(run);
      console.log(JSON.stringify(observation, null, 2));
      if (!ready) process.exitCode = 2;
      break;
    }
    default:
      console.log(
        'Acme test lab\n  list\n  preview <scenario|baseline>\n  apply <scenario>\n  restore baseline\n  publish\n  observe --url <acme-url> [--outcome "what Driftless did"]\n  status',
      );
      if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  if (locked) rmSync(join(lab, "lock"), { recursive: true });
}
