import { mkdir, readFile as readNodeFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import * as fc from "fast-check";

import { configFileForFormat, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";
import type { SpecTreeEnvFixtureWriterMethod } from "@/domains/spec/fixture-writer-methods";
import {
  createFilesystemSpecTreeSource,
  getKindDefinition,
  type Kind,
  KIND_REGISTRY,
  type KindDefinition,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecTreeConfig,
  type SpecTreeKindCategory,
  type SpecTreeProjection,
  type SpecTreeRegistry,
  type SpecTreeSnapshot,
  type SpecTreeSource,
} from "@/lib/spec-tree";
import {
  buildRepresentativeFixture,
  createSource,
  type RepresentativeSpecTreeFixture,
} from "@testing/generators/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/domains/spec/fixture-writer-methods";

export type { Config } from "@/config/types";

const TEMP_PREFIX = "spx-test-env-";
const RESIDUAL_PLACEHOLDER_FILE = "placeholder.md";
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

export type WithSpecTreeEnvOptions = {
  readonly registry?: SpecTreeRegistry;
  readonly fixture?: RepresentativeSpecTreeFixture;
};

export type SpecTreeEnv =
  & {
    readonly productDir: string;
    readFile(relativePath: string): Promise<string>;
    readonly arbitraryNodePath: fc.Arbitrary<string>;
    readonly arbitraryDecisionPath: fc.Arbitrary<string>;
    readonly arbitrarySpecTree: fc.Arbitrary<SpecTreeFixture>;
  }
  & {
    readonly [method in SpecTreeEnvFixtureWriterMethod]: SpecTreeEnvFixtureWriter;
  };

export type CurrentSpecTreeEnv = SpecTreeEnv & {
  readonly fixture: RepresentativeSpecTreeFixture;
  memorySource(fixture?: RepresentativeSpecTreeFixture): SpecTreeSource;
  filesystemSource(): SpecTreeSource;
  materialize(fixture?: RepresentativeSpecTreeFixture): Promise<void>;
  readMemorySnapshot(fixture?: RepresentativeSpecTreeFixture): Promise<SpecTreeSnapshot>;
  readFilesystemSnapshot(): Promise<SpecTreeSnapshot>;
  projectMemory(fixture?: RepresentativeSpecTreeFixture): Promise<SpecTreeProjection>;
  projectFilesystem(): Promise<SpecTreeProjection>;
};

export async function writeOrderedDirectory(env: SpecTreeEnv, directory: string): Promise<void> {
  await env.writeRaw(
    [SPEC_TREE_CONFIG.ROOT_DIRECTORY, directory, RESIDUAL_PLACEHOLDER_FILE].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
    "",
  );
}

export function withTestEnv<T>(
  config: Config,
  callback: (env: SpecTreeEnv) => Promise<T>,
): Promise<T> {
  return withTempDir(TEMP_PREFIX, async (productDir) => {
    const configFile = configFileForFormat(productDir, DEFAULT_CONFIG_FILE_FORMAT);
    const serialized = serializeConfigFileSections(
      configFile.format,
      config,
    );
    if (!serialized.ok) {
      throw new Error(serialized.error);
    }
    await writeAt(productDir, configFile.filename, serialized.value);

    const env: SpecTreeEnv = {
      productDir,
      writeNode: (relativePath, contents) => writeAt(productDir, relativePath, contents),
      writeDecision: (relativePath, contents) => writeAt(productDir, relativePath, contents),
      writeRaw: (relativePath, contents) => writeAt(productDir, relativePath, contents),
      readFile: (relativePath) => readAt(productDir, relativePath),
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

    return await callback(env);
  });
}

export async function withSpecTreeEnv(
  config: Config,
  callback: (env: CurrentSpecTreeEnv) => Promise<void>,
  options: WithSpecTreeEnvOptions = {},
): Promise<void> {
  const registry = options.registry ?? KIND_REGISTRY;
  const fixture = options.fixture ?? buildRepresentativeFixture(registry);

  await withTestEnv(config, async (env) => {
    const currentEnv = Object.create(Object.prototype, {
      ...Object.getOwnPropertyDescriptors(env),
      fixture: valueDescriptor(fixture),
      memorySource: valueDescriptor((sourceFixture = fixture) => createSource(sourceFixture.entries)),
      filesystemSource: valueDescriptor(() => createFilesystemSpecTreeSource({ productDir: env.productDir, registry })),
      materialize: valueDescriptor((sourceFixture = fixture) =>
        materializeSpecTreeFixture(env, registry, sourceFixture)
      ),
      readMemorySnapshot: valueDescriptor((sourceFixture = fixture) =>
        readSpecTree({ source: createSource(sourceFixture.entries), registry })
      ),
      readFilesystemSnapshot: valueDescriptor(() =>
        readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir, registry }),
          registry,
        })
      ),
      projectMemory: valueDescriptor(async (sourceFixture = fixture) =>
        projectSpecTree(await readSpecTree({ source: createSource(sourceFixture.entries), registry }))
      ),
      projectFilesystem: valueDescriptor(async () =>
        projectSpecTree(
          await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir, registry }),
            registry,
          }),
        )
      ),
    }) as CurrentSpecTreeEnv;

    await callback(currentEnv);
  });
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

function valueDescriptor<T>(value: T): PropertyDescriptor {
  return {
    value,
    enumerable: true,
    writable: false,
    configurable: false,
  };
}

function readKinds(config: Config, category: SpecTreeKindCategory): readonly KindEntry[] {
  const rawSpecTree = config[SPEC_TREE_CONFIG.SECTION];
  if (rawSpecTree === undefined || rawSpecTree === null || typeof rawSpecTree !== "object") {
    throw new Error(`Config supplied to spec-tree generators is missing the ${SPEC_TREE_CONFIG.SECTION} section`);
  }
  const specTree = rawSpecTree as SpecTreeConfig;
  const kinds = specTree.kinds;
  return Object.entries(kinds)
    .filter((entry): entry is [string, KindDefinition<Kind>] => {
      const value = entry[1];
      return (value as KindDefinition<Kind>).category === category;
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

async function writeAt(productDir: string, relativePath: string, contents: string): Promise<void> {
  const absolute = resolvePath(productDir, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, "utf8");
}

async function readAt(productDir: string, relativePath: string): Promise<string> {
  const absolute = resolvePath(productDir, relativePath);
  return readNodeFile(absolute, "utf8");
}

async function materializeSpecTreeFixture(
  env: SpecTreeEnv,
  registry: SpecTreeRegistry,
  fixture: RepresentativeSpecTreeFixture,
): Promise<void> {
  await env.writeRaw(productFilePath(fixture), specContent(fixture.product.title));
  await env.writeNode(nodeSpecPath(registry, fixture.root), specContent(nodeTitle(fixture.root)));
  await env.writeNode(nodeSpecPath(registry, fixture.child, fixture.root), specContent(nodeTitle(fixture.child)));
  await env.writeNode(nodeSpecPath(registry, fixture.peer), specContent(nodeTitle(fixture.peer)));
  await env.writeDecision(
    decisionPath(registry, fixture.decision, fixture.root),
    specContent(decisionTitle(fixture.decision)),
  );
}

function productFilePath(fixture: RepresentativeSpecTreeFixture): string {
  return joinSpecTreeFixturePath(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    `${fixture.product.title}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
  );
}

function nodeSpecPath(
  registry: SpecTreeRegistry,
  node: RepresentativeSpecTreeFixture["root"],
  parent?: RepresentativeSpecTreeFixture["root"],
): string {
  return joinSpecTreeFixturePath(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    parent === undefined ? "" : nodeDirectoryName(registry, parent),
    nodeDirectoryName(registry, node),
    `${node.slug}.md`,
  );
}

function decisionPath(
  registry: SpecTreeRegistry,
  decision: RepresentativeSpecTreeFixture["decision"],
  parent: RepresentativeSpecTreeFixture["root"],
): string {
  const definition = getKindDefinition(decision.kind, registry);
  return joinSpecTreeFixturePath(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodeDirectoryName(registry, parent),
    `${decision.order}-${decision.slug}${definition.suffix}`,
  );
}

function nodeDirectoryName(
  registry: SpecTreeRegistry,
  node: RepresentativeSpecTreeFixture["root"],
): string {
  const definition = getKindDefinition(node.kind, registry);
  return `${node.order}-${node.slug}${definition.suffix}`;
}

function nodeTitle(node: RepresentativeSpecTreeFixture["root"]): string {
  return node.title ?? node.slug;
}

function decisionTitle(decision: RepresentativeSpecTreeFixture["decision"]): string {
  return decision.title ?? decision.slug;
}

function specContent(title: string): string {
  return `# ${title}\n\nPROVIDES generated fixture content\nSO THAT spec-tree tests\nCAN read current nodes\n`;
}

function joinSpecTreeFixturePath(...segments: readonly string[]): string {
  return segments.filter((segment) => segment.length > 0).join("/");
}

function resolvePath(productDir: string, relativePath: string): string {
  const root = resolve(productDir);
  const absolute = resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new Error(`Path escapes product directory: ${relativePath}`);
  }
  return absolute;
}
