import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { routes } from "./src/routes.ts";

const root = dirname(fileURLToPath(import.meta.url));
type Stream = {
  id: number;
  name: string;
  pricing: "unit" | "hours" | "recurring";
  monthly: number;
};
type Session = {
  streams: Stream[];
  nextId: number;
  modal: boolean;
  modalSeen: boolean;
  delay: number;
  touched: number;
};
const fixture = (): Stream[] => [
  { id: 1, name: "Wholesale", pricing: "unit", monthly: 14200 },
  { id: 2, name: "Retail", pricing: "unit", monthly: 9850 },
];
const sessions = new Map<string, Session>();
const fresh = (): Session => ({
  streams: fixture(),
  nextId: 3,
  modal: false,
  modalSeen: false,
  delay: 0,
  touched: Date.now(),
});

function session(req: IncomingMessage, res: ServerResponse) {
  const id = /(?:^|;\s*)acme-session=([a-f0-9-]+)/.exec(
    req.headers.cookie ?? "",
  )?.[1];
  const now = Date.now();
  for (const [key, value] of sessions)
    if (now - value.touched > 6 * 60 * 60 * 1000) sessions.delete(key);
  const existing = id && sessions.get(id);
  if (existing) {
    existing.touched = now;
    return existing;
  }
  if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!);
  const next = fresh();
  const token = randomUUID();
  sessions.set(token, next);
  res.setHeader(
    "set-cookie",
    `acme-session=${token}; Path=/; HttpOnly; SameSite=Lax`,
  );
  return next;
}
const json = (res: ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16384) throw new Error("Request too large");
  }
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object");
  return value;
}
function revision() {
  if (process.env.ACME_COMMIT_SHA)
    return { sha: process.env.ACME_COMMIT_SHA, dirty: false };
  try {
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    return {
      sha: git("rev-parse", "HEAD"),
      dirty: Boolean(git("status", "--porcelain", "--untracked-files=no")),
    };
  } catch {
    return { sha: null, dirty: null };
  }
}
const started = revision();
const method = (
  req: IncomingMessage,
  res: ServerResponse,
  allowed: string[],
) => {
  if (allowed.includes(req.method ?? "")) return true;
  res.setHeader("allow", allowed.join(", "));
  json(res, { error: "Method not allowed" }, 405);
  return false;
};

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://acme");
    res.setHeader("cache-control", "no-store");
    if (url.pathname === "/api/version") {
      if (!method(req, res, ["GET"])) return;
      const current = revision();
      json(res, {
        ...current,
        startedSha: started.sha,
        restartRequired: current.sha !== started.sha,
      });
      return;
    }
    if (["/styles.css", "/lab.js"].includes(url.pathname)) {
      if (!method(req, res, ["GET"])) return;
      res.setHeader(
        "content-type",
        url.pathname.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      );
      res.end(
        await readFile(
          join(root, "src", "pages", url.pathname.slice(1)),
          "utf8",
        ),
      );
      return;
    }
    const state = session(req, res);
    if (url.pathname === "/lab/start") {
      if (!method(req, res, ["GET"])) return;
      const delay = Number(url.searchParams.get("delay") ?? 0);
      if (!Number.isInteger(delay) || delay < 0 || delay > 5000) {
        json(res, { error: "Delay must be 0–5000 milliseconds" }, 400);
        return;
      }
      Object.assign(state, fresh(), {
        modal: url.searchParams.get("modal") === "1",
        delay,
      });
      res.writeHead(302, { location: "/login" });
      res.end();
      return;
    }
    if (url.pathname === "/api/lab") {
      if (!method(req, res, ["GET", "POST"])) return;
      if (req.method === "POST") {
        const value = await body(req);
        if (
          typeof value.modal !== "boolean" ||
          !Number.isInteger(value.delay) ||
          Number(value.delay) < 0 ||
          Number(value.delay) > 5000
        ) {
          json(
            res,
            { error: "Supply modal (boolean) and delay (0–5000 milliseconds)" },
            400,
          );
          return;
        }
        Object.assign(state, {
          modal: value.modal,
          delay: value.delay,
          modalSeen: false,
        });
      }
      json(res, {
        modal: state.modal,
        delay: state.delay,
        modalSeen: state.modalSeen,
      });
      return;
    }
    if (url.pathname === "/api/lab/reset") {
      if (!method(req, res, ["POST"])) return;
      Object.assign(state, { streams: fixture(), nextId: 3, modalSeen: false });
      json(res, { ok: true });
      return;
    }
    if (url.pathname === "/api/lab/visit") {
      if (!method(req, res, ["POST"])) return;
      const showModal = state.modal && !state.modalSeen;
      state.modalSeen = true;
      json(res, { showModal });
      return;
    }
    if (url.pathname === "/api/streams") {
      if (!method(req, res, ["GET", "POST"])) return;
      if (req.method === "POST") {
        const given = await body(req);
        if (
          typeof given.name !== "string" ||
          !given.name.trim() ||
          given.name.length > 100 ||
          !["unit", "hours", "recurring"].includes(String(given.pricing)) ||
          typeof given.monthly !== "number" ||
          !Number.isFinite(given.monthly)
        ) {
          json(
            res,
            {
              error: "Supply a name, pricing model, and finite monthly amount",
            },
            400,
          );
          return;
        }
        const stream: Stream = {
          id: state.nextId++,
          name: given.name.trim(),
          pricing: given.pricing as Stream["pricing"],
          monthly: given.monthly,
        };
        state.streams.push(stream);
        json(res, stream, 201);
        return;
      }
      if (state.delay)
        await new Promise((resolve) => setTimeout(resolve, state.delay));
      json(res, state.streams);
      return;
    }
    const removing = /^\/api\/streams\/(\d+)$/.exec(url.pathname);
    if (removing) {
      if (!method(req, res, ["DELETE"])) return;
      const at = state.streams.findIndex((s) => s.id === Number(removing[1]));
      if (at >= 0) state.streams.splice(at, 1);
      json(res, { ok: at >= 0 });
      return;
    }
    const route = routes.find((r) => r.path === url.pathname);
    if (!route) {
      json(res, { error: "Not found" }, 404);
      return;
    }
    if (!method(req, res, ["GET"])) return;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      await readFile(join(root, "src", "pages", `${route.page}.html`), "utf8"),
    );
  } catch (error) {
    json(
      res,
      {
        error:
          error instanceof SyntaxError
            ? "Invalid JSON"
            : (error as Error).message,
      },
      400,
    );
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 8789);
  server.listen(port, host, () => console.log(`acme: http://${host}:${port}`));
}
