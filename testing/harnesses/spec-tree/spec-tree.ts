import { mkdir, mkdtemp, readFile as readNodeFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import * as fc from "fast-check";

import { configFileForFormat, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";
import type { SpecTreeEnvFixtureWriterMethod } from "@/domains/spec/fixture-writer-methods";
import type { Kind, KindDefinition, SpecTreeConfig } from "@/lib/spec-tree/config";
import { SPEC_TREE_CONFIG, type SpecTreeKindCategory } from "@/lib/spec-tree/config";
export { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/domains/spec/fixture-writer-methods";

export type { Config } from "@/config/types";

const TEMP_PREFIX = "spx-test-env-";
const MIN_SPEC_ORDER_INDEX = 10;
const MAX_SPEC_ORDER_INDEX = 99;
const SLUG_POOL = ["foo", "bar", "baz", "widget", "gizmo", "spec", "stub", "sample", "probe", "fixture"];
const MAX_FIXTURE_ENTRIES = 5;

export type SpecTreeFixtureEntry = {
  readonly kind: string;
  readonly path: string;
};

export type SpecTreeFixture = {
  readonly entries: readonly SpecTreeFixtureEntry[];
};

type SpecTreeEnvFixtureWriter = (relativePath: string, contents: string) => Promise<void>;

export type SpecTreeEnv =
  & {
    readonly projectDir: string;
    readFile(relativePath: string): Promise<string>;
    readonly arbitraryNodePath: fc.Arbitrary<string>;
    readonly arbitraryDecisionPath: fc.Arbitrary<string>;
    readonly arbitrarySpecTree: fc.Arbitrary<SpecTreeFixture>;
  }
  & {
    readonly [method in SpecTreeEnvFixtureWriterMethod]: SpecTreeEnvFixtureWriter;
  };

export async function withTestEnv(
  config: Config,
  callback: (env: SpecTreeEnv) => Promise<void>,
): Promise<void> {
  const tempRoot = resolve(tmpdir());
  const projectDir = await mkdtemp(join(tempRoot, TEMP_PREFIX));

  try {
    const configFile = configFileForFormat(projectDir, DEFAULT_CONFIG_FILE_FORMAT);
    const serialized = serializeConfigFileSections(
      configFile.format,
      config as Record<string, unknown>,
    );
    if (!serialized.ok) {
      throw new Error(serialized.error);
    }
    await writeAt(projectDir, configFile.filename, serialized.value);

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
  const entries = readKinds(config, SPEC_TREE_CONFIG.CATEGORY.NODE);
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitraryNodePath has no node kinds registered");
  }
  return arbitraryPathFromKinds(entries);
}

export function arbitraryDecisionPath(config: Config): fc.Arbitrary<string> {
  const entries = readKinds(config, SPEC_TREE_CONFIG.CATEGORY.DECISION);
  if (entries.length === 0) {
    throw new Error("Config supplied to arbitraryDecisionPath has no decision kinds registered");
  }
  return arbitraryPathFromKinds(entries);
}

export function arbitrarySpecTree(config: Config): fc.Arbitrary<SpecTreeFixture> {
  const all = [
    ...readKinds(config, SPEC_TREE_CONFIG.CATEGORY.NODE),
    ...readKinds(config, SPEC_TREE_CONFIG.CATEGORY.DECISION),
  ];
  if (all.length === 0) {
    throw new Error("Config supplied to arbitrarySpecTree has no kinds registered");
  }
  return fc
    .array(arbitraryEntryFromKinds(all), { minLength: 0, maxLength: MAX_FIXTURE_ENTRIES })
    .map((entries) => ({ entries }));
}

type KindEntry = { readonly kind: string; readonly suffix: string };

function readKinds(config: Config, category: SpecTreeKindCategory): readonly KindEntry[] {
  const specTree = config[SPEC_TREE_CONFIG.SECTION] as SpecTreeConfig | undefined;
  if (!specTree || typeof specTree !== "object") {
    throw new Error(`Config supplied to spec-tree generators is missing the ${SPEC_TREE_CONFIG.SECTION} section`);
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
      fc.integer({ min: MIN_SPEC_ORDER_INDEX, max: MAX_SPEC_ORDER_INDEX }),
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
