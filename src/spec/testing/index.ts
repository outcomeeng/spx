import { mkdir, mkdtemp, readFile as readNodeFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import * as fc from "fast-check";
import { stringify as yamlStringify } from "yaml";

import type { Config } from "@/config/types.js";
import type { Kind, KindDefinition, SpecTreeConfig } from "@/spec/config.js";

export function configToToml(config: Config): string {
  return tomlSections("", config as Record<string, unknown>);
}

function tomlSections(prefix: string, obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  const allScalars = entries.every(([, v]) => typeof v !== "object" || v === null);
  if (allScalars) {
    let out = prefix.length > 0 ? `[${prefix}]\n` : "";
    for (const [k, v] of entries) {
      if (typeof v === "string") out += `${k} = "${v}"\n`;
      else if (typeof v === "number" || typeof v === "boolean") out += `${k} = ${v}\n`;
    }
    return out;
  }
  let out = "";
  for (const [k, v] of entries) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out += tomlSections(prefix.length > 0 ? `${prefix}.${k}` : k, v as Record<string, unknown>);
    }
  }
  return out;
}

export type { Config } from "@/config/types.js";

const TEMP_PREFIX = "spx-test-env-";
const CONFIG_FILENAME = "spx.config.yaml";
const MIN_BSP_INDEX = 10;
const MAX_BSP_INDEX = 99;
const SLUG_POOL = ["foo", "bar", "baz", "widget", "gizmo", "spec", "stub", "sample", "probe", "fixture"];
const MAX_FIXTURE_ENTRIES = 5;

export type SpecTreeFixtureEntry = {
  readonly kind: string;
  readonly path: string;
};

export type SpecTreeFixture = {
  readonly entries: readonly SpecTreeFixtureEntry[];
};

export type SpecTreeEnv = {
  readonly projectDir: string;
  writeNode(relativePath: string, contents: string): Promise<void>;
  writeDecision(relativePath: string, contents: string): Promise<void>;
  writeRaw(relativePath: string, contents: string): Promise<void>;
  readFile(relativePath: string): Promise<string>;
  readonly arbitraryNodePath: fc.Arbitrary<string>;
  readonly arbitraryDecisionPath: fc.Arbitrary<string>;
  readonly arbitrarySpecTree: fc.Arbitrary<SpecTreeFixture>;
};

export async function withTestEnv(
  config: Config,
  callback: (env: SpecTreeEnv) => Promise<void>,
): Promise<void> {
  const tempRoot = resolve(tmpdir());
  const projectDir = await mkdtemp(join(tempRoot, TEMP_PREFIX));

  try {
    await writeAt(projectDir, CONFIG_FILENAME, yamlStringify(config));

    const env: SpecTreeEnv = {
      projectDir,
      writeNode: (relativePath, contents) => writeAt(projectDir, relativePath, contents),
      writeDecision: (relativePath, contents) => writeAt(projectDir, relativePath, contents),
      writeRaw: (relativePath, contents) => writeAt(projectDir, relativePath, contents),
      readFile: (relativePath) => readAt(projectDir, relativePath),
      get arbitraryNodePath() {
        return arbitraryNodePath(config);
      },
      get arbitraryDecisionPath() {
        return arbitraryDecisionPath(config);
      },
      get arbitrarySpecTree() {
        return arbitrarySpecTree(config);
      },
    };

    await callback(env);
  } finally {
    await safeRemove(projectDir, tempRoot);
  }
}

export function arbitraryNodePath(config: Config): fc.Arbitrary<string> {
  const entries = readKinds(config, "node");
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitraryNodePath has no node kinds registered");
  }
  return arbitraryPathFromKinds(entries);
}

export function arbitraryDecisionPath(config: Config): fc.Arbitrary<string> {
  const entries = readKinds(config, "decision");
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitraryDecisionPath has no decision kinds registered");
  }
  return arbitraryPathFromKinds(entries);
}

export function arbitrarySpecTree(config: Config): fc.Arbitrary<SpecTreeFixture> {
  const all = [...readKinds(config, "node"), ...readKinds(config, "decision")];
  if (all.length === 0) {
    throw new Error("Config supplied to arbitrarySpecTree has no kinds registered");
  }
  return fc
    .array(arbitraryEntryFromKinds(all), { minLength: 0, maxLength: MAX_FIXTURE_ENTRIES })
    .map((entries) => ({ entries }));
}

type KindEntry = { readonly kind: string; readonly suffix: string };

function readKinds(config: Config, category: "node" | "decision"): readonly KindEntry[] {
  const specTree = config["specTree"] as SpecTreeConfig | undefined;
  if (!specTree || typeof specTree !== "object") {
    throw new Error("Config supplied to spec-tree generators is missing the 'specTree' section");
  }
  const kinds = specTree.kinds ?? {};
  return Object.entries(kinds)
    .filter((entry): entry is [string, KindDefinition<Kind>] => {
      const value = entry[1];
      return typeof value === "object"
        && value !== null
        && (value as KindDefinition<Kind>).category === category;
    })
    .map(([key, value]) => ({ kind: key, suffix: value.suffix }));
}

function arbitraryPathFromKinds(entries: readonly KindEntry[]): fc.Arbitrary<string> {
  return arbitraryEntryFromKinds(entries).map((entry) => entry.path);
}

function arbitraryEntryFromKinds(
  entries: readonly KindEntry[],
): fc.Arbitrary<SpecTreeFixtureEntry> {
  return fc
    .tuple(
      fc.integer({ min: MIN_BSP_INDEX, max: MAX_BSP_INDEX }),
      fc.constantFrom(...SLUG_POOL),
      fc.constantFrom(...entries),
    )
    .map(([index, slug, entry]) => ({
      kind: entry.kind,
      path: `${index}-${slug}${entry.suffix}`,
    }));
}

async function writeAt(projectDir: string, relativePath: string, contents: string): Promise<void> {
  const absolute = resolvePath(projectDir, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, "utf8");
}

async function readAt(projectDir: string, relativePath: string): Promise<string> {
  const absolute = resolvePath(projectDir, relativePath);
  return readNodeFile(absolute, "utf8");
}

function resolvePath(projectDir: string, relativePath: string): string {
  const root = resolve(projectDir);
  const absolute = resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new Error(`Path escapes project directory: ${relativePath}`);
  }
  return absolute;
}

async function safeRemove(projectDir: string, tempRoot: string): Promise<void> {
  const resolved = resolve(projectDir);
  const rootWithSep = tempRoot.endsWith(sep) ? tempRoot : tempRoot + sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error(`Refusing to remove path outside os.tmpdir(): ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}
