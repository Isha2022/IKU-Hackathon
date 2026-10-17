import type { IsoUtcString } from "../lib/types";

/** Accept UTC ISO timestamps with seconds and optional millisecond precision. */
export function validateWindow(start: IsoUtcString, end: IsoUtcString): void {
  for (const value of [start, end]) {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
    const timestamp = Date.parse(value);
    if (!match || !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString() !== `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`) {
      throw new Error("Expected a valid ISO UTC timestamp ending in Z");
    }
  }
  if (Date.parse(start) >= Date.parse(end)) {
    throw new Error("Start must be earlier than end");
  }
}

