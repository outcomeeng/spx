import { createHash } from "node:crypto";

import type { Result } from "./types";

export type DescriptorJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly DescriptorJsonValue[]
  | { readonly [key: string]: DescriptorJsonValue };

export type DescriptorSectionDigest = {
  readonly canonicalJson: string;
  readonly sha256: string;
};

const DEFAULT_DESCRIPTOR_PATH = "descriptor section";
const SHA256_ALGORITHM = "sha256";
const UTF8_ENCODING = "utf8";
const HEX_ENCODING = "hex";

type JsonRecord = { readonly [key: string]: DescriptorJsonValue };

export function canonicalDescriptorJson(
  value: unknown,
  path = DEFAULT_DESCRIPTOR_PATH,
): Result<string> {
  const normalized = normalizeDescriptorJsonValue(value, path, new WeakSet<object>());
  if (!normalized.ok) return normalized;

  return { ok: true, value: JSON.stringify(normalized.value) };
}

export function digestDescriptorSection(
  value: unknown,
  path = DEFAULT_DESCRIPTOR_PATH,
): Result<DescriptorSectionDigest> {
  const canonical = canonicalDescriptorJson(value, path);
  if (!canonical.ok) return canonical;

  const sha256 = createHash(SHA256_ALGORITHM)
    .update(Buffer.from(canonical.value, UTF8_ENCODING))
    .digest(HEX_ENCODING);

  return {
    ok: true,
    value: {
      canonicalJson: canonical.value,
      sha256,
    },
  };
}

function normalizeDescriptorJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): Result<DescriptorJsonValue> {
  switch (typeof value) {
    case "string":
    case "boolean":
      return { ok: true, value };
    case "number":
      return Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, error: `${path} must be a finite number` };
    case "object":
      if (value === null) return { ok: true, value };
      return normalizeObject(value, path, seen);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      return { ok: false, error: `${path} must be JSON-representable` };
  }
}

function normalizeObject(
  value: object,
  path: string,
  seen: WeakSet<object>,
): Result<DescriptorJsonValue> {
  if (seen.has(value)) {
    return { ok: false, error: `${path} must not contain circular references` };
  }
  seen.add(value);

  const result = Array.isArray(value)
    ? normalizeArray(value, path, seen)
    : normalizeRecord(value, path, seen);

  // Keep `seen` as the current DFS path so sibling branches may share objects.
  seen.delete(value);
  return result;
}

function normalizeArray(
  value: readonly unknown[],
  path: string,
  seen: WeakSet<object>,
): Result<readonly DescriptorJsonValue[]> {
  const normalized: DescriptorJsonValue[] = [];
  for (const [index, item] of value.entries()) {
    const itemResult = normalizeDescriptorJsonValue(item, `${path}[${index}]`, seen);
    if (!itemResult.ok) return itemResult;
    normalized.push(itemResult.value);
  }
  return { ok: true, value: normalized };
}

function normalizeRecord(
  value: object,
  path: string,
  seen: WeakSet<object>,
): Result<JsonRecord> {
  if (!isPlainRecord(value)) {
    return { ok: false, error: `${path} must be a plain object` };
  }

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) {
    return { ok: false, error: `${path} must not contain symbol keys` };
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, DescriptorJsonValue> = {};
  for (const key of (keys as string[]).sort(compareUnicodeCodePointStrings)) {
    const child = normalizeDescriptorJsonValue(record[key], `${path}.${key}`, seen);
    if (!child.ok) return child;
    normalized[key] = child.value;
  }

  return { ok: true, value: normalized };
}

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function compareUnicodeCodePointStrings(left: string, right: string): number {
  const leftCodePoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightCodePoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < length; index += 1) {
    const delta = leftCodePoints[index] - rightCodePoints[index];
    if (delta !== 0) return delta;
  }

  return leftCodePoints.length - rightCodePoints.length;
}
