import express from "express";
import type { Storage } from "./storage/index.ts";
import { validateItemInput, type Item, type ListFilter, type Status, STATUSES } from "./types.ts";
import { parseCsv, serializeCsv } from "./csv.ts";

const CSV_HEADER = [
  "name", "category", "serial", "condition", "qty",
  "cost_cents", "price_cents", "location", "status", "notes",
];

function itemToCsvRow(i: Item): string[] {
  return [
    i.name, i.category, i.serial, i.condition, String(i.qty),
    String(i.costCents), String(i.priceCents), i.location, i.status, i.notes,
  ];
}

export function createApp(storage: Storage) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/api/items", async (req, res, next) => {
    try {
      const filter: ListFilter = {};
      if (typeof req.query.status === "string" && STATUSES.includes(req.query.status as Status)) {
        filter.status = req.query.status as Status;
      }
      if (typeof req.query.category === "string") filter.category = req.query.category;
      if (typeof req.query.q === "string") filter.q = req.query.q;
      if (req.query.limit) filter.limit = Number(req.query.limit) || undefined;
      res.json(await storage.list(filter));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/items", async (req, res, next) => {
    try {
      const v = validateItemInput(req.body);
      if (!v.ok) return res.status(400).json({ errors: v.errors });
      res.status(201).json(await storage.create(v.value));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/items/:id", async (req, res, next) => {
    try {
      const item = await storage.get(req.params.id);
      if (!item) return res.status(404).json({ error: "not found" });
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/items/:id", async (req, res, next) => {
    try {
      const existing = await storage.get(req.params.id);
      if (!existing) return res.status(404).json({ error: "not found" });
      // merge-then-validate: a partial body updates only the given fields,
      // but the merged result must still pass full validation
      const v = validateItemInput({ ...existing, ...req.body });
      if (!v.ok) return res.status(400).json({ errors: v.errors });
      res.json(await storage.update(req.params.id, v.value));
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/items/:id", async (req, res, next) => {
    try {
      // Inventory is a ledger: delete archives, it never destroys.
      const archived = await storage.archive(req.params.id);
      if (!archived) return res.status(404).json({ error: "not found" });
      res.json(archived);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/summary", async (_req, res, next) => {
    try {
      const items = await storage.list({ limit: 1000 });
      const byStatus: Record<string, number> = {};
      let costCents = 0;
      let valueCents = 0;
      for (const i of items) {
        byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
        if (i.status === "in_stock" || i.status === "listed") {
          costCents += i.costCents * i.qty;
          valueCents += i.priceCents * i.qty;
        }
      }
      res.json({ count: items.length, byStatus, activeCostCents: costCents, activeValueCents: valueCents });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/items.csv", async (_req, res, next) => {
    try {
      const items = await storage.list({ limit: 1000 });
      const rows = [CSV_HEADER, ...items.map(itemToCsvRow)];
      res.type("text/csv").send(serializeCsv(rows));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/items/import", express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }), async (req, res, next) => {
    try {
      if (typeof req.body !== "string" || req.body.length === 0) {
        return res.status(400).json({ error: "send CSV as text/csv body" });
      }
      let rows: string[][];
      try {
        rows = parseCsv(req.body);
      } catch (e) {
        return res.status(400).json({ error: `CSV parse error: ${(e as Error).message}` });
      }
      const [header, ...dataRows] = rows;
      if (!header || header.join(",") !== CSV_HEADER.join(",")) {
        return res.status(400).json({ error: `header must be: ${CSV_HEADER.join(",")}` });
      }
      const errors: { line: number; errors: string[] }[] = [];
      const imported: Item[] = [];
      for (let idx = 0; idx < dataRows.length; idx++) {
        const row = dataRows[idx]!;
        if (row.length === 1 && row[0] === "") continue; // blank line
        const raw = {
          name: row[0], category: row[1], serial: row[2], condition: row[3],
          qty: Number(row[4]), costCents: Number(row[5]), priceCents: Number(row[6]),
          location: row[7], status: row[8], notes: row[9],
        };
        const v = validateItemInput(raw);
        if (!v.ok) {
          errors.push({ line: idx + 2, errors: v.errors }); // +2: header is line 1
          continue;
        }
        imported.push(await storage.create(v.value));
      }
      res.status(errors.length && !imported.length ? 400 : 200).json({
        imported: imported.length,
        failed: errors.length,
        errors,
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
