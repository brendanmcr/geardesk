export const CONDITIONS = ["new", "excellent", "good", "fair", "poor"] as const;
export const STATUSES = ["in_stock", "listed", "sold", "archived"] as const;

export type Condition = (typeof CONDITIONS)[number];
export type Status = (typeof STATUSES)[number];

export interface Item {
  id: string;
  name: string;
  category: string;
  serial: string;
  condition: Condition;
  qty: number;
  costCents: number;
  priceCents: number;
  location: string;
  status: Status;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ItemInput = Omit<Item, "id" | "createdAt" | "updatedAt">;

export interface ListFilter {
  status?: Status;
  category?: string;
  q?: string;
  limit?: number;
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

// Validates raw input into an ItemInput, or returns a list of problems.
// Used identically by the JSON API and the CSV importer, so both paths
// enforce the same rules.
export function validateItemInput(raw: unknown): { ok: true; value: ItemInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;

  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (name.length < 1 || name.length > 120) errors.push("name must be 1-120 characters");

  const category = typeof r.category === "string" ? r.category.trim() : "";
  if (category.length > 60) errors.push("category must be at most 60 characters");

  const serial = typeof r.serial === "string" ? r.serial.trim() : "";
  if (serial.length > 120) errors.push("serial must be at most 120 characters");

  const condition = (r.condition ?? "good") as Condition;
  if (!CONDITIONS.includes(condition)) errors.push(`condition must be one of ${CONDITIONS.join(", ")}`);

  const status = (r.status ?? "in_stock") as Status;
  if (!STATUSES.includes(status)) errors.push(`status must be one of ${STATUSES.join(", ")}`);

  const qty = r.qty ?? 1;
  if (!isInt(qty) || qty < 0 || qty > 1_000_000) errors.push("qty must be an integer >= 0");

  const costCents = r.costCents ?? 0;
  if (!isInt(costCents) || costCents < 0) errors.push("costCents must be an integer >= 0");

  const priceCents = r.priceCents ?? 0;
  if (!isInt(priceCents) || priceCents < 0) errors.push("priceCents must be an integer >= 0");

  const location = typeof r.location === "string" ? r.location.trim() : "";
  if (location.length > 120) errors.push("location must be at most 120 characters");

  const notes = typeof r.notes === "string" ? r.notes : "";
  if (notes.length > 2000) errors.push("notes must be at most 2000 characters");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      category,
      serial,
      condition,
      status,
      qty: qty as number,
      costCents: costCents as number,
      priceCents: priceCents as number,
      location,
      notes,
    },
  };
}
