import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Item, ItemInput, ListFilter } from "../types.ts";

export interface Storage {
  kind: string;
  init(): Promise<void>;
  close(): Promise<void>;
  create(input: ItemInput): Promise<Item>;
  get(id: string): Promise<Item | null>;
  update(id: string, input: ItemInput): Promise<Item | null>;
  archive(id: string): Promise<Item | null>;
  list(filter?: ListFilter): Promise<Item[]>;
}

function matches(item: Item, f: ListFilter): boolean {
  if (f.status && item.status !== f.status) return false;
  if (f.category && item.category !== f.category) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${item.name} ${item.serial} ${item.notes}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function memoryStorage(): Storage {
  const items = new Map<string, Item>();
  return {
    kind: "memory",
    async init() {},
    async close() {},
    async create(input) {
      const now = new Date().toISOString();
      const item: Item = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      items.set(item.id, item);
      return item;
    },
    async get(id) {
      return items.get(id) ?? null;
    },
    async update(id, input) {
      const existing = items.get(id);
      if (!existing) return null;
      const updated: Item = { ...existing, ...input, updatedAt: new Date().toISOString() };
      items.set(id, updated);
      return updated;
    },
    async archive(id) {
      const existing = items.get(id);
      if (!existing) return null;
      const archived: Item = { ...existing, status: "archived", updatedAt: new Date().toISOString() };
      items.set(id, archived);
      return archived;
    },
    async list(filter = {}) {
      const limit = Math.min(filter.limit ?? 200, 1000);
      return [...items.values()]
        .filter((i) => matches(i, filter))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    },
  };
}

const COLS =
  "id, name, category, serial, condition, qty, cost_cents, price_cents, location, status, notes, created_at, updated_at";

function rowToItem(row: Record<string, unknown>): Item {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    serial: row.serial as string,
    condition: row.condition as Item["condition"],
    qty: row.qty as number,
    costCents: row.cost_cents as number,
    priceCents: row.price_cents as number,
    location: row.location as string,
    status: row.status as Item["status"],
    notes: row.notes as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export function pgStorage(connectionString: string): Storage {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    kind: "pg",
    async init() {
      await pool.query("SELECT 1");
    },
    async close() {
      await pool.end();
    },
    async create(input) {
      const id = randomUUID();
      const r = await pool.query(
        `INSERT INTO items (id, name, category, serial, condition, qty, cost_cents, price_cents, location, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS}`,
        [id, input.name, input.category, input.serial, input.condition, input.qty, input.costCents, input.priceCents, input.location, input.status, input.notes]
      );
      return rowToItem(r.rows[0]);
    },
    async get(id) {
      const r = await pool.query(`SELECT ${COLS} FROM items WHERE id = $1`, [id]);
      return r.rows[0] ? rowToItem(r.rows[0]) : null;
    },
    async update(id, input) {
      const r = await pool.query(
        `UPDATE items SET name=$2, category=$3, serial=$4, condition=$5, qty=$6, cost_cents=$7,
           price_cents=$8, location=$9, status=$10, notes=$11, updated_at=now()
         WHERE id = $1 RETURNING ${COLS}`,
        [id, input.name, input.category, input.serial, input.condition, input.qty, input.costCents, input.priceCents, input.location, input.status, input.notes]
      );
      return r.rows[0] ? rowToItem(r.rows[0]) : null;
    },
    async archive(id) {
      const r = await pool.query(
        `UPDATE items SET status='archived', updated_at=now() WHERE id = $1 RETURNING ${COLS}`,
        [id]
      );
      return r.rows[0] ? rowToItem(r.rows[0]) : null;
    },
    async list(filter = {}) {
      const limit = Math.min(filter.limit ?? 200, 1000);
      const where: string[] = [];
      const params: unknown[] = [];
      if (filter.status) {
        params.push(filter.status);
        where.push(`status = $${params.length}`);
      }
      if (filter.category) {
        params.push(filter.category);
        where.push(`category = $${params.length}`);
      }
      if (filter.q) {
        params.push(`%${filter.q.toLowerCase()}%`);
        where.push(`lower(name || ' ' || serial || ' ' || notes) LIKE $${params.length}`);
      }
      params.push(limit);
      const sql = `SELECT ${COLS} FROM items
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY created_at DESC LIMIT $${params.length}`;
      const r = await pool.query(sql, params);
      return r.rows.map(rowToItem);
    },
  };
}

export function storageFromEnv(env = process.env): Storage {
  if (env.DATABASE_URL) return pgStorage(env.DATABASE_URL);
  return memoryStorage();
}
