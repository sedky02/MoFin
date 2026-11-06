/**
 * Prisma's delegate API over arrays for DB-less e2e specs; models and foreign keys come from
 * schema.prisma, with Postgres semantics (CASCADE, SET NULL, RESTRICT, rollback).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export type Row = Record<string, unknown> & { id: string };
export type OnDelete = 'Cascade' | 'Restrict' | 'SetNull';
export interface Relation {
  /** Prisma delegate name of the table holding the foreign key, e.g. `goalInstance`. */
  child: string;
  /** - */
  name: string;
  /** - */
  column: string;
  parent: string;
  onDelete: OnDelete;
}

export const delegateName = (model: string) =>
  model[0].toLowerCase() + model.slice(1);

/** Every model and foreign key in schema.prisma, so the fake follows the real schema. */
export function readSchema(): { tables: string[]; relations: Relation[] } {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );
  const tables: string[] = [];
  const relations: Relation[] = [];
  for (const [, model, body] of schema.matchAll(
    /^model (\w+) \{([\s\S]*?)^\}/gm,
  )) {
    tables.push(delegateName(model));
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(\w+)\s+(\w+)(\?)?\s+@relation\(([^)]*)\)/);
      const column = m?.[4].match(/fields:\s*\[(\w+)\]/)?.[1];
      if (!m || !column) continue;
      // Prisma's defaults when onDelete is left out.
      const onDelete = (m[4].match(/onDelete:\s*(\w+)/)?.[1] ??
        (m[3] ? 'SetNull' : 'Restrict')) as OnDelete;
      relations.push({
        child: delegateName(model),
        name: m[1],
        column,
        parent: delegateName(m[2]),
        onDelete,
      });
    }
  }
  return { tables, relations };
}

export const SCHEMA = readSchema();
/** Tables holding a `userId`: everything that belongs to a user directly. */
export const USER_TABLES = SCHEMA.relations
  .filter((r) => r.parent === 'user')
  .map((r) => r.child);

/** - */
export function inMemoryPrisma() {
  let tables: Record<string, Row[]> = Object.fromEntries(
    SCHEMA.tables.map((t) => [t, []]),
  );
  let nextId = 0;

  function matches(
    table: string,
    row: Row,
    where: Record<string, unknown>,
  ): boolean {
    return Object.entries(where).every(([key, value]) => {
      const relation = SCHEMA.relations.find(
        (r) => r.child === table && r.name === key,
      );
      if (relation) {
        const parent = tables[relation.parent].find(
          (p) => p.id === row[relation.column],
        );
        return (
          !!parent &&
          matches(relation.parent, parent, value as Record<string, unknown>)
        );
      }
      if (value && typeof value === 'object' && 'not' in value)
        return (row[key] ?? null) !== (value as { not: unknown }).not;
      return (row[key] ?? null) === value;
    });
  }

  /** Deletes rows the way Postgres applies each referencing foreign key. */
  function remove(table: string, doomed: Row[]) {
    if (!doomed.length) return;
    const ids = new Set(doomed.map((r) => r.id));
    tables[table] = tables[table].filter((r) => !ids.has(r.id));
    for (const rel of SCHEMA.relations.filter((r) => r.parent === table)) {
      const children = tables[rel.child].filter((c) =>
        ids.has(c[rel.column] as string),
      );
      if (!children.length) continue;
      if (rel.onDelete === 'Restrict') {
        throw new Error(
          `Foreign key ${rel.child}.${rel.column} still references a deleted ${table}`,
        );
      }
      if (rel.onDelete === 'SetNull')
        children.forEach((c) => (c[rel.column] = null));
      else remove(rel.child, children);
    }
  }

  const delegate = (table: string) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const row = tables[table].find((r) => matches(table, r, where));
      return row ? { ...row } : null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      tables[table]
        .filter((r) => matches(table, r, where))
        .map((r) => ({ ...r })),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = { id: `${table}-${++nextId}`, ...data };
      tables[table].push(row);
      return { ...row };
    },
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const fields of data)
        tables[table].push({ id: `${table}-${++nextId}`, ...fields });
      return { count: data.length };
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const row = tables[table].find((r) => matches(table, r, where));
      if (!row) throw new Error('record not found');
      return { ...Object.assign(row, data) };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const hit = tables[table].filter((r) => matches(table, r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    delete: async ({ where }: { where: Record<string, unknown> }) => {
      const row = tables[table].find((r) => matches(table, r, where));
      if (!row) throw new Error('record not found');
      remove(table, [row]);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const hit = tables[table].filter((r) => matches(table, r, where));
      remove(table, hit);
      return { count: hit.length };
    },
  });

  const prisma: Record<string, unknown> & {
    tables: () => Record<string, Row[]>;
  } = {
    tables: () => tables,
    $transaction: async (run: (tx: unknown) => unknown) => {
      const before = structuredClone(tables);
      try {
        return await run(prisma);
      } catch (err) {
        tables = before;
        throw err;
      }
    },
  };
  for (const table of SCHEMA.tables) prisma[table] = delegate(table);
  return prisma;
}

export type Db = ReturnType<typeof inMemoryPrisma>;
