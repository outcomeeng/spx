import type { Config, SpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import type { IgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import type { LayerContext, ScopeResolverConfig } from "@/lib/file-inclusion/pipeline";
import { ARTIFACT_DIRECTORIES_DEFAULT } from "@/lib/file-inclusion/predicates/artifact-directory";
import { HIDDEN_PREFIX_DEFAULT } from "@/lib/file-inclusion/predicates/hidden-prefix";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

export const integrationConfig: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

const spxRootSegment = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const ignoreSourceFilename = IGNORE_SOURCE_FILENAME_DEFAULT;

export const resolverConfig: ScopeResolverConfig = {
  artifactDirectories: [...ARTIFACT_DIRECTORIES_DEFAULT],
  hiddenPrefix: HIDDEN_PREFIX_DEFAULT,
  ignoreSourceFilename,
  specTreeRootSegment: spxRootSegment,
};

export const excludeRelativePath = `${spxRootSegment}/${ignoreSourceFilename}`;

const firstArtifactDir = ARTIFACT_DIRECTORIES_DEFAULT[0];

export const cleanFilePath = "src/index.ts";
export const artifactFilePath = `${firstArtifactDir}/pkg/index.js`;
export const hiddenFilePath = `src/${HIDDEN_PREFIX_DEFAULT}config.ts`;
export const excludedNodeSegment = "21-excluded-sample.enabler";
export const ignoredFilePath = `${spxRootSegment}/${excludedNodeSegment}/impl.ts`;
// Matches both hidden-prefix (basename starts with HIDDEN_PREFIX_DEFAULT) and ignore-source (under an excluded node).
// Does NOT use an artifact directory so it is collected during the walk.
export const multiLayerFilePath = `${spxRootSegment}/${excludedNodeSegment}/${HIDDEN_PREFIX_DEFAULT}hidden-file.ts`;

export const noopIgnoreReader: IgnoreSourceReader = {
  isUnderIgnoreSource: () => false,
  entries: () => [],
  matchedEntry: () => undefined,
};

export function makeLayerContext(config: ScopeResolverConfig): LayerContext {
  return { config, ignoreReader: noopIgnoreReader };
}

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

export async function writeTestFiles(env: SpecTreeEnv): Promise<void> {
  await env.writeRaw(cleanFilePath, "export const x = 1;");
  await env.writeRaw(artifactFilePath, "module.exports = {};");
  await env.writeRaw(hiddenFilePath, "export const hidden = true;");
  await env.writeRaw(ignoredFilePath, "export const impl = {};");
  await env.writeRaw(multiLayerFilePath, "export const multi = true;");
}

export async function writeExclude(env: SpecTreeEnv, segments: readonly string[]): Promise<void> {
  await env.writeRaw(excludeRelativePath, segments.join("\n"));
}
