import { Pool } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = { insert: async (t: string, v: object) => v as any, findById: async (t: string, id: string) => ({}) as any,
  update: async (t: string, id: string, v: object) => v, query: async (sql: string, p: unknown[]) => [] };
