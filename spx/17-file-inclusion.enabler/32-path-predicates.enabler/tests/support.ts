import type { Config, SpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { createIgnoreSourceReader, IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import type { IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import { ARTIFACT_DIRECTORIES_DEFAULT } from "@/lib/file-inclusion/predicates/artifact-directory";
import { HIDDEN_PREFIX_DEFAULT } from "@/lib/file-inclusion/predicates/hidden-prefix";
import type {
  ArtifactDirectoryConfig,
  HiddenPrefixConfig,
  IgnoreSourcePredicateConfig,
} from "@/lib/file-inclusion/types";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

export { arbNodeSegment, arbSubpath, PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

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
const excludeFilename = `${spxRootSegment}/${ignoreSourceFilename}`;

const readerConfig: IgnoreSourceReaderConfig = {
  ignoreSourceFilename,
  specTreeRootSegment: spxRootSegment,
};

export const artifactDirs = ARTIFACT_DIRECTORIES_DEFAULT;
export const artifactDirConfig: ArtifactDirectoryConfig = {
  artifactDirectories: [...ARTIFACT_DIRECTORIES_DEFAULT],
};

export const hiddenPrefix = HIDDEN_PREFIX_DEFAULT;
export const hiddenPrefixConfig: HiddenPrefixConfig = {
  hiddenPrefix: HIDDEN_PREFIX_DEFAULT,
};

export function spxPath(segment: string, ...rest: string[]): string {
  return [spxRootSegment, segment, ...rest].join("/");
}

export async function writeExclude(env: SpecTreeEnv, lines: readonly string[]): Promise<void> {
  await env.writeRaw(excludeFilename, lines.join("\n"));
}

export async function makeIgnoreSourceConfig(
  env: SpecTreeEnv,
  segments: readonly string[],
): Promise<IgnoreSourcePredicateConfig> {
  await writeExclude(env, segments);
  const reader = createIgnoreSourceReader(env.projectDir, readerConfig);
  return { reader };
}
