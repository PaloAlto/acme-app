import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { server } from "./server.ts";

let base: string;
before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));
async function client() {
  const response = await fetch(base + "/login");
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });
}

test("fixture writes and resets are isolated; IDs do not collide after deletion", async () => {
  const a = await client();
  const b = await client();
  await a("/api/streams/1", "DELETE");
  const added = await a("/api/streams", "POST", {
    name: "Consulting",
    pricing: "hours",
    monthly: 4000,
  });
  assert.equal((await added.json()).id, 3);
  assert.deepEqual(
    (await (await b("/api/streams")).json()).map(
      (s: { name: string }) => s.name,
    ),
    ["Wholesale", "Retail"],
  );
  await b("/api/streams/2", "DELETE");
  await a("/api/lab/reset", "POST");
  assert.equal((await (await a("/api/streams")).json()).length, 2);
  assert.equal((await (await b("/api/streams")).json()).length, 1);
});

test("modal is once per session and rearms on reset; loading delay is deterministic", async () => {
  const a = await client();
  const b = await client();
  assert.equal(
    (await a("/api/lab", "POST", { modal: true, delay: 120 })).status,
    200,
  );
  assert.equal(
    (await (await a("/api/lab/visit", "POST")).json()).showModal,
    true,
  );
  assert.equal(
    (await (await a("/api/lab/visit", "POST")).json()).showModal,
    false,
  );
  assert.equal(
    (await (await b("/api/lab/visit", "POST")).json()).showModal,
    false,
  );
  await a("/api/lab/reset", "POST");
  assert.equal(
    (await (await a("/api/lab/visit", "POST")).json()).showModal,
    true,
  );
  const start = performance.now();
  await a("/api/streams");
  assert.ok(performance.now() - start >= 110);
  assert.equal((await (await b("/api/lab")).json()).delay, 0);
});

test("launch URL arms a fresh session without bypassing login", async () => {
  const a = await client();
  const launch = await a("/lab/start?modal=1&delay=1500");
  assert.equal(launch.status, 302);
  assert.equal(launch.headers.get("location"), "/login");
  assert.deepEqual(await (await a("/api/lab")).json(), {
    modal: true,
    delay: 1500,
    modalSeen: false,
  });
});

test("invalid input and unsupported methods do not mutate fixtures or crash the server", async () => {
  const a = await client();
  assert.equal(
    (await a("/api/lab", "POST", { modal: true, delay: 6000 })).status,
    400,
  );
  assert.equal((await a("/lab/start?delay=-1")).status, 400);
  assert.equal((await a("/api/lab/reset")).status, 405);
  assert.equal((await a("/api/streams", "POST", { name: "Bad" })).status, 400);
  assert.equal(
    (await fetch(base + "/api/streams", { method: "POST", body: "{" })).status,
    400,
  );
  const version = await a("/api/version");
  assert.equal(version.headers.get("cache-control"), "no-store");
  assert.ok(Object.hasOwn(await version.json(), "startedSha"));
  assert.equal((await (await a("/api/streams")).json()).length, 2);
});
