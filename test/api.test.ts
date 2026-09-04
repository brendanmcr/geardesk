import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { memoryStorage, pgStorage, type Storage } from "../src/storage/index.ts";
import { createApp } from "../src/app.ts";
import type { ItemInput } from "../src/types.ts";

const sample = (over: Partial<ItemInput> = {}): ItemInput => ({
  name: "Fender Jazz Bass",
  category: "bass",
  serial: "MX21100001",
  condition: "excellent",
  qty: 1,
  costCents: 85000,
  priceCents: 119900,
  location: "shelf A",
  status: "in_stock",
  notes: "",
  ...over,
});

const adapters: [string, () => Storage][] = [["memory", () => memoryStorage()]];
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  adapters.push(["pg", () => pgStorage(dbUrl)]);
}

for (const [name, make] of adapters) {
  test(`[${name}] create, get, update, archive`, async () => {
    const s = make();
    await s.init();
    const created = await s.create(sample());
    assert.equal((await s.get(created.id))?.name, "Fender Jazz Bass");
    const updated = await s.update(created.id, sample({ status: "listed", priceCents: 109900 }));
    assert.equal(updated?.status, "listed");
    const archived = await s.archive(created.id);
    assert.equal(archived?.status, "archived");
    assert.equal(await s.get("00000000-0000-0000-0000-000000000000"), null);
    await s.close();
  });

  test(`[${name}] list filters by status, category, and q`, async () => {
    const s = make();
    await s.init();
    const tag = `t${Date.now()}`;
    await s.create(sample({ name: `Alpha ${tag}`, category: tag, status: "in_stock" }));
    await s.create(sample({ name: `Beta ${tag}`, category: tag, status: "sold" }));
    const inStock = await s.list({ status: "in_stock", category: tag });
    assert.equal(inStock.length, 1);
    assert.match(inStock[0]!.name, /Alpha/);
    const byQ = await s.list({ q: `beta ${tag}`.toLowerCase() });
    assert.equal(byQ.length, 1);
    await s.close();
  });
}

async function boot() {
  const storage = memoryStorage();
  await storage.init();
  const app = createApp(storage);
  const server = app.listen(0);
  await once(server, "listening");
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { base, stop: async () => { server.close(); await storage.close(); } };
}

test("api: create validates and rejects bad input", async () => {
  const { base, stop } = await boot();
  try {
    const bad = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", qty: -2, condition: "melted" }),
    });
    assert.equal(bad.status, 400);
    const { errors } = await bad.json();
    assert.ok(errors.length >= 3);

    const good = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sample()),
    });
    assert.equal(good.status, 201);
  } finally {
    await stop();
  }
});

test("api: put merges partial body then validates; delete archives", async () => {
  const { base, stop } = await boot();
  try {
    const created = await (
      await fetch(`${base}/api/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sample()),
      })
    ).json();

    const patched = await fetch(`${base}/api/items/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "listed" }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).status, "listed");

    const badPatch = await fetch(`${base}/api/items/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qty: -5 }),
    });
    assert.equal(badPatch.status, 400);

    const del = await fetch(`${base}/api/items/${created.id}`, { method: "DELETE" });
    assert.equal((await del.json()).status, "archived");
  } finally {
    await stop();
  }
});

test("api: csv export/import round-trip with per-line errors", async () => {
  const { base, stop } = await boot();
  try {
    await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sample({ name: 'Amp, "The Beast"', notes: "multi\nline note" })),
    });
    const csv = await (await fetch(`${base}/api/items.csv`)).text();
    assert.match(csv, /""The Beast""/);

    // import the export back, plus one broken line
    const withBad = csv + 'bad row,,,melted,notanumber,0,0,,in_stock,\r\n';
    const result = await (
      await fetch(`${base}/api/items/import`, {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: withBad,
      })
    ).json();
    assert.equal(result.imported, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.errors[0].line, 3);

    const all = await (await fetch(`${base}/api/items`)).json();
    assert.equal(all.length, 2);
  } finally {
    await stop();
  }
});

test("api: summary totals active inventory only", async () => {
  const { base, stop } = await boot();
  try {
    const post = (over: Partial<ItemInput>) =>
      fetch(`${base}/api/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sample(over)),
      });
    await post({ status: "in_stock", qty: 2, costCents: 100, priceCents: 300 });
    await post({ status: "listed", qty: 1, costCents: 50, priceCents: 200 });
    await post({ status: "sold", qty: 1, costCents: 999, priceCents: 999 });
    const summary = await (await fetch(`${base}/api/summary`)).json();
    assert.equal(summary.count, 3);
    assert.equal(summary.activeCostCents, 2 * 100 + 50);
    assert.equal(summary.activeValueCents, 2 * 300 + 200);
    assert.equal(summary.byStatus.sold, 1);
  } finally {
    await stop();
  }
});
