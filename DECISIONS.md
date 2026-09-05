# Decisions

## 2026-09-04 — A controllable product fixture for Driftless

Acme exists only to exercise Driftless. Keep the existing Node server and
HTML pages: a framework or database would add machinery without making the
first scenarios more useful. Product scenarios modify real mapped source,
not only a feature-flag file or empty commit. One scenario at a time makes
starting conditions explicit. Exact replacements fail on baseline drift;
restoration reverses those edits in a new commit rather than rewriting
history. Existing Git identity and credentials perform commits and pushes;
the hosted application has neither Git access nor a mutation endpoint for
repository history.

Browser challenges are independent of product history. An HTTP-only session
cookie owns in-memory fixture data, modal state, and loading delay. A bounded
six-hour session store is sufficient for this disposable app; durable state,
shared named test accounts, and multi-instance coordination are deferred.
Launch URLs reset and configure the browser that opens them, allowing a
fresh capture browser to reproduce challenges without receiving another
browser's cookie. Normal login still runs.

The Git CLI records evidence under ignored `.lab/runs`, including expected
impact and observed versions. Expected agent outcomes are qualitative;
automatic assertions against Driftless's authenticated API are deferred until
we have reviewed real results. Test harness code and expectations live outside
mapped product paths, while each product edit touches the actual Forecast
page. The internal-refactor case deliberately touches a mapped file so it
exercises impact judgment, not just unmapped-file filtering.

Acme embeds its SHA in its deployed image. Locally it reports both the
checkout SHA and the server-start SHA, plus tracked dirtiness, because page
files are live but server imports are not. Publish and deployment are separate
observations. The push command refuses a batch of unshipped scenarios: a single
final deployment cannot test intermediate UI states. Branch isolation,
scenario combinations, and a UI for Git operations are deferred. Baseline
restoration changes Acme only; it does not erase Driftless's accumulated
articles, cards, or ingest history.

Playwright remains the only development dependency; pnpm's lockfile pins
it. Node's built-in test runner exercises session isolation and actual Git
commits in temporary repositories. Playwright uses a dedicated port and a
fresh server, and deploy runs both suites before building the image.
