# Acme

Acme exists only to test Driftless: a small forecasting app with repeatable
product changes, a real Git history, and predictable browser challenges.

## Run

Requires Node 24+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm exec playwright install chromium
pnpm start                         # http://127.0.0.1:8789
pnpm check                         # isolated Git/API tests and Playwright
```

Any email and password of at least four characters signs in. This is a test
fixture, not an authentication system. Each browser session gets its own
revenue streams and challenges through an HTTP-only cookie. Sessions expire
after six idle hours, when the server restarts, or when the bounded session
store evicts its oldest entry. There is no database. The test server uses
18789 and refuses to reuse a running app, so tests cannot alter your demo.

## Local Driftless loop

1. In your **local** Driftless Acme workspace, set Settings → Repository to
   the absolute path of this checkout. A clone URL still reads remote
   commits and will not see your local lab commits. Use a separate local
   test workspace if you want to preserve an existing connection.
2. Run `pnpm start` here, or `pnpm acme` in Driftless. The capture environment
   should use `http://127.0.0.1:8789` and `/login` as its sign-in URL. A worker
   running inside a container needs a host address reachable from there.
3. Establish your starting help-center state with “Check now,” review any
   existing cards, and make a baseline capture before applying a scenario.
4. Run a scenario:

   ```sh
   pnpm lab list
   pnpm lab preview rename-control
   pnpm lab apply rename-control
   ```

   `apply` changes real source files and creates a real local commit. It
   refuses a dirty checkout or another active scenario. The catalog also
   includes `forecast-export` (a CSV download) and `internal-refactor` (a
   mapped-file change that should not need a documentation rewrite).

5. Restart Acme after the commit. Run “Check now” in Driftless, inspect its
   proposed changes, and try a capture. Record what happened:

   ```sh
   pnpm lab observe --url http://127.0.0.1:8789 \
     --outcome 'Forecast card found; button label updated; capture succeeded'
   pnpm lab status
   ```

   `observe` records the reported checkout and server SHAs, dirtiness,
   readiness, and your optional observation. Exit code 2 means this run's
   exact revision is not ready; exit code 1 is a command/request error.
   Readiness is a point-in-time observation, not a guarantee during a
   rolling deploy. The outcome text is a human observation, not an automatic
   assertion about Driftless.

6. Restore and repeat:

   ```sh
   pnpm lab preview baseline
   pnpm lab restore baseline
   ```

   Restore reverses only the known scenario edits and creates a new commit.
   It never resets Git history or overwrites an unexpected baseline. A new
   application gets a new SHA, so Driftless can ingest it again. Restoring
   Acme does **not** reset Driftless's cards, articles, or ingest history;
   the restoration is itself a product change for Driftless to review.

## Stage: real pushes and deployments

The implementation must first be committed and published normally. After
that, apply **one** scenario, then:

```sh
pnpm lab publish
pnpm lab observe --url https://acme.driftless.paloalto-dev.com
```

`publish` uses your existing Git credentials, permits only `main` on
`PaloAlto/acme-app` via `origin`, checks fast-forward ancestry, and refuses
unpublished implementation commits or more than one pending lab commit.
It never force-pushes. It can publish a restore commit too. Publish and
observe each change before restoring, so intermediate UI revisions actually
reach the server. A retry after an uncertain push is safe when HEAD already
matches the remote. A push reaches **all connected Driftless environments**;
there is no environment-isolation flag or branch routing in this version.

The GitHub webhook can reach Driftless before Acme finishes deploying.
Wait for the deploy workflow, then use `observe` to check the running SHA
before capturing. `/api/version` reports `sha`, `startedSha`, `dirty`, and
`restartRequired`. The image embeds its commit SHA. Locally, source pages
are read live while server imports require a restart; readiness therefore
requires a clean checkout and a server started at the expected SHA.

Every push to `main` runs the checks, builds an image, and rolls the stage
Acme service. Deploys are serialized to avoid simultaneous updates to the
shared service. GitHub may coalesce pending runs; publish one scenario at a
time and wait for it before the next. The runtime holds no Git credentials
and offers no endpoint for commits or pushes.

## Browser challenges

Open `/lab` to choose an announcement modal and a 0–5 second data-loading
delay. The modal blocks the first dashboard visit until dismissed. Reset
restores the two fixture streams and rearms the modal, retaining the selected
challenge settings. Changing settings in this browser does not affect
Driftless's separate capture browser.

Use the launch link generated by the lab as the capture environment's
**sign-in URL** to arm a fresh capture browser, for example:

```text
http://127.0.0.1:8789/lab/start?modal=1&delay=1500
```

It resets that browser's fixture, arms the challenge, and redirects to the
normal login page. Keep the capture environment's base URL at the app root.
Opening a launch URL again resets the session again. Use `/login` for the
normal baseline flow. Challenges require no commit or redeploy.

## Layout and extending the lab

- `server.ts`: pages, session fixtures, JSON API, revision reporting.
- `src/pages/`: actual product pages, plus the separate `/lab` controls.
- `src/routes.ts`: routes; `e2e/`: browser tests.
- `lab/catalog.json`: named source edits, product commit messages, and
  expected documentation impact. Each replacement verifies its occurrence
  count before any file is changed.
- `lab/state.json`: the active product scenario, committed with its edits.
- `lab/cli.ts`: previews, commits, pushes, observations, and run status.
- `.lab/runs/`: ignored JSON evidence with run ID, before/after SHAs,
  scenario, expected result, push status, and observations. These records
  stay on the machine that ran the CLI; copy them explicitly when needed.

The initial catalog targets `src/pages/dashboard.html`, already mapped to
Forecast in Driftless's Acme seed. New pages need a corresponding help-center
map update or an explicit unmapped-page test. Catalog edits must be updated
when the baseline source changes; a stale catalog fails rather than guessing.
Only one scenario is active at a time. Keep scenarios small and add browser
tests proving the changed behavior. Add challenge controls independently of
product scenarios so the same product change can be captured with or without
an obstacle.

A failed commit leaves its edits for inspection and records the failure;
resolve it before another lab run. Commands serialize through `.lab/lock`.
If the process was killed, inspect the checkout before removing that stale
lock. Git's own identity and signing configuration apply to generated commits.
