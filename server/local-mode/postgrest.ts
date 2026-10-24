/**
 * Taximun — Emulador local de PostgREST (modo demo sin Supabase).
 *
 * Implementa el subconjunto de la API de supabase-js que usa el backend de
 * Taximun: from().select/insert/update/upsert/delete con filtros encadenables,
 * order/limit/range/single/maybeSingle y conteos exactos.
 * SOLO para desarrollo/demo. En producción se usa Supabase real.
 */

type Row = Record<string, any>;
type Filter = { col: string; op: string; val: any };

/**
 * Claves primarias reales de las tablas cuyo PK no es "id".
 * Supabase infiere el objetivo del conflicto de un upsert desde el PK de la
 * tabla; el emulador local usa este registro para replicar ese comportamiento
 * (p. ej. driver_live_status se indexa por driver_id).
 */
const TABLE_PK: Record<string, string[]> = {
  driver_live_status: ["driver_id"],
  taxi_user_profiles: ["user_id"],
  real_drivers: ["driver_id"],
};

export type LocalStore = Map<string, Row[]>;

const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike"] as const;

function matchesFilter(row: Row, f: Filter): boolean {
  const value = row[f.col];
  switch (f.op) {
    case "eq":
      return value === f.val;
    case "neq":
      return value !== f.val;
    case "gt":
      return compare(value, f.val) > 0;
    case "gte":
      return compare(value, f.val) >= 0;
    case "lt":
      return compare(value, f.val) < 0;
    case "lte":
      return compare(value, f.val) <= 0;
    case "in":
      return Array.isArray(f.val) && f.val.includes(value);
    case "is":
      if (f.val === null) return value === null || value === undefined;
      return value === f.val;
    case "like":
      return String(value ?? "").includes(String(f.val).replace(/%/g, ""));
    case "ilike":
      return String(value ?? "")
        .toLowerCase()
        .includes(String(f.val).replace(/%/g, "").toLowerCase());
    default:
      return true;
  }
}

function compare(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return na === nb ? 0 : na < nb ? -1 : 1;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Parsea sintaxis PostgREST de `.or()`: "col.op.val,col.op.val" */
function parseOrClause(clause: string): Filter[] {
  return clause
    .split(/,(?![^(]*\))/)
    .map((part) => {
      const m = part.match(/^([a-z_]+)\.(is|neq|gt|gte|lt|lte|eq|in)\.(.+)$/i);
      if (!m) return null;
      const [, col, op, raw] = m;
      let val: any = raw;
      if (op === "is") val = raw === "null" ? null : raw;
      else if (op === "in") val = raw.replace(/[()]/g, "").split(",").map((v) => v.trim());
      else if (raw !== "null" && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) val = Number(raw);
      return { col, op, val } as Filter;
    })
    .filter(Boolean) as Filter[];
}

export class LocalQuery implements PromiseLike<{ data: any; error: any; count: number | null }> {
  private filters: Filter[] = [];
  private orFilters: Filter[][] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private wantReturn = false;
  private countMode: "exact" | null = null;
  private headOnly = false;

  constructor(
    private store: LocalStore,
    private table: string,
    private op: "select" | "insert" | "update" | "upsert" | "delete",
    private payload?: any,
    private opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    if (op === "select") this.wantReturn = true;
    if (op === "insert" || op === "upsert" || op === "update") {
      // supabase devuelve datos solo si encadenas .select(); aquí lo marcamos al llamar select()
    }
  }

  select(_columns?: string, opts?: { count?: "exact"; head?: boolean }): this {
    this.wantReturn = true;
    if (opts?.count === "exact") this.countMode = "exact";
    if (opts?.head) this.headOnly = true;
    return this;
  }

  eq(col: string, val: any) { this.filters.push({ col, op: "eq", val }); return this; }
  neq(col: string, val: any) { this.filters.push({ col, op: "neq", val }); return this; }
  gt(col: string, val: any) { this.filters.push({ col, op: "gt", val }); return this; }
  gte(col: string, val: any) { this.filters.push({ col, op: "gte", val }); return this; }
  lt(col: string, val: any) { this.filters.push({ col, op: "lt", val }); return this; }
  lte(col: string, val: any) { this.filters.push({ col, op: "lte", val }); return this; }
  in(col: string, val: any[]) { this.filters.push({ col, op: "in", val }); return this; }
  is(col: string, val: any) { this.filters.push({ col, op: "is", val }); return this; }
  like(col: string, val: string) { this.filters.push({ col, op: "like", val }); return this; }
  ilike(col: string, val: string) { this.filters.push({ col, op: "ilike", val }); return this; }
  or(clause: string) { this.orFilters.push(parseOrClause(clause)); return this; }
  not(col: string, op: string, val: any) { this.filters.push({ col, op: `not:${op}`, val }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitCount = n; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.singleMode = "single"; return this as any; }
  maybeSingle() { this.singleMode = "maybe"; return this as any; }

  private rows(): Row[] {
    return this.store.get(this.table) ?? [];
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) => {
      const okAnd = this.filters.every((f) =>
        f.op.startsWith("not:") ? !matchesFilter(row, { ...f, op: f.op.slice(4) }) : matchesFilter(row, f),
      );
      if (!okAnd) return false;
      if (this.orFilters.length === 0) return true;
      return this.orFilters.some((group) => group.every((f) => matchesFilter(row, f)));
    });
  }

  private applyOrder(rows: Row[]): Row[] {
    let sorted = [...rows];
    for (const { col, ascending } of this.orders) {
      sorted = sorted.sort((a, b) => {
        const cmp = compare(a[col], b[col]);
        return ascending ? cmp : -cmp;
      });
    }
    return sorted;
  }

  private execute(): { data: any; error: any; count: number | null } {
    const rows = this.rows();
    let result: { data: any; error: any; count: number | null } = { data: null, error: null, count: null };

    if (this.op === "select") {
      let out = this.applyOrder(this.applyFilters(rows));
      const count = this.countMode === "exact" ? out.length : null;
      if (this.rangeFrom !== null) out = out.slice(this.rangeFrom, (this.rangeTo ?? out.length - 1) + 1);
      if (this.limitCount !== null) out = out.slice(0, this.limitCount);
      if (this.headOnly) {
        result = { data: null, error: null, count };
      } else if (this.singleMode === "single") {
        if (out.length === 0) {
          result = { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count: null };
        } else {
          result = { data: out[0], error: null, count };
        }
      } else if (this.singleMode === "maybe") {
        result = { data: out[0] ?? null, error: null, count };
      } else {
        result = { data: out, error: null, count };
      }
      return result;
    }

    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Row[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const row: Row = { ...item };
        if (!row.id) row.id = crypto.randomUUID();
        const now = new Date().toISOString();
        if (!row.created_at) row.created_at = now;
        row.updated_at = now;
        rows.push(row);
        inserted.push(row);
      }
      return { ...this.shapeReturn(inserted), error: null };
    }

    if (this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const explicitCols = (this.opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      const conflictCols = explicitCols.length ? explicitCols : (TABLE_PK[this.table] ?? ["id"]);
      const out: Row[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const existing = rows.find((r) => conflictCols.every((c) => r[c] === item[c]));
        const now = new Date().toISOString();
        if (existing) {
          Object.assign(existing, item, { updated_at: now });
          out.push(existing);
        } else {
          const row: Row = { ...item };
          if (!row.id) row.id = crypto.randomUUID();
          if (!row.created_at) row.created_at = now;
          row.updated_at = now;
          rows.push(row);
          out.push(row);
        }
      }
      return { ...this.shapeReturn(out), error: null };
    }

    if (this.op === "update") {
      const matching = this.applyFilters(rows);
      const now = new Date().toISOString();
      for (const row of matching) {
        Object.assign(row, this.payload, { updated_at: now });
      }
      const out = this.wantReturn ? matching : [];
      return { ...this.shapeReturn(out), error: null, count: matching.length };
    }

    if (this.op === "delete") {
      const matching = this.applyFilters(rows);
      const keep = rows.filter((r) => !matching.includes(r));
      this.store.set(this.table, keep);
      const out = this.wantReturn ? matching : [];
      return { ...this.shapeReturn(out), error: null, count: matching.length };
    }

    return result;
  }

  /** Aplica single/maybeSingle/limit al resultado de una mutación. */
  private shapeReturn(out: Row[]): { data: any; count: number | null } {
    if (!this.wantReturn) return { data: null, count: null };
    let rows = out;
    if (this.rangeFrom !== null) rows = rows.slice(this.rangeFrom, (this.rangeTo ?? rows.length - 1) + 1);
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    if (this.singleMode === "single") {
      if (rows.length === 0) {
        return { data: null, count: null };
      }
      return { data: rows[0], count: rows.length };
    }
    if (this.singleMode === "maybe") return { data: rows[0] ?? null, count: rows.length };
    if (!Array.isArray(this.payload) && rows.length === 1 && this.op === "insert") return { data: rows[0], count: 1 };
    return { data: rows, count: rows.length };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled ?? undefined, onrejected ?? undefined) as PromiseLike<TResult1 | TResult2>;
  }
}

export function createLocalQueryFactory(store: LocalStore) {
  return (table: string) => ({
    select: (columns?: string, opts?: { count?: "exact"; head?: boolean }) =>
      new LocalQuery(store, table, "select").select(columns, opts),
    insert: (payload: any) => new LocalQuery(store, table, "insert", payload),
    upsert: (payload: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
      new LocalQuery(store, table, "upsert", payload, opts),
    update: (payload: any) => new LocalQuery(store, table, "update", payload),
    delete: () => new LocalQuery(store, table, "delete"),
  });
}
