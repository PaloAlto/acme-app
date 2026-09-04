# Acme

A small forecasting app: sign in, a dashboard of revenue streams, a settings
page. It exists so a help center can be written about it. Driftless keeps
the Acme Demo help center from this repository: every commit here that
touches a mapped page is a change the help center may need to follow, and
every page here is one the capture agent takes screenshots of.

## Run it

```sh
node server.ts           # http://127.0.0.1:8789
PORT=4000 node server.ts
```

Node 24 or newer; there is nothing to install. Any email signs in with any
password of four characters or more; the session is a mark in the browser.

The e2e specs run with Playwright, which is the one dependency:

```sh
npm install
npx playwright install chromium
npm test
```

## Hosted

Every push to `main` ships the app to Driftless's stage, at
`https://acme.driftless.paloalto-dev.com`: the workflow in `.github`
builds the image from the `Dockerfile` and rolls the `acme` service in
that stack, through a role that can push this one image and roll this
one service. Sign in there the same way; the data lives in the task's
memory and resets when it restarts.

## Layout

- `server.ts` serves the pages and a JSON API over in-memory data.
- `src/routes.ts` names every screen; the server and the specs read it.
- `src/pages/` is one HTML file per screen and the stylesheet.
- `e2e/` is one spec per screen.

## Making a change the help center notices

Change a page, commit, push to `main`. The Driftless board for Acme Demo
maps `src/pages/login.html` to Getting started, `src/pages/dashboard.html`
to Forecast, and `src/pages/settings.html` to Settings; a push that touches
one of them reaches the board through the GitHub App's webhook, or on the
next "Check now". Commit messages read as product changes, since the board
shows them as the card's title.
