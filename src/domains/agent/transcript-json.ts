export function parseJsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function firstString(row: Record<string, unknown>, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    const value = valueAtPath(row, path);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

export function valueAtPath(row: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = row;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
