import type { PoolClient } from "pg";
import { pool } from "./client";
import type { JsonValue } from "../lib/types";

export function uuid(value: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Expected a UUID");
  }
}

export function text(value: string, name: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must not be empty`);
}

export function json(value: JsonValue): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === undefined || typeof item === "function" || typeof item === "symbol" ||
      (typeof item === "number" && !Number.isFinite(item))) {
      throw new Error("Expected JSON-compatible data");
    }
    return item;
  });
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    // A fresh statement snapshot after waiting for the thread lock is essential.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    client.release();
  }
}

