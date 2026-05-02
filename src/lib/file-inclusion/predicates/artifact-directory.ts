import type { ArtifactDirectoryConfig, LayerDecision } from "../types";

export const ARTIFACT_DIRECTORIES_DEFAULT = [
  "node_modules",
  "dist",
  "build",
  ".next",
  ".source",
  ".git",
  "out",
  "coverage",
] as const satisfies readonly string[];

export const ARTIFACT_DIRECTORY_LAYER = "artifact-directory";
const LAYER = ARTIFACT_DIRECTORY_LAYER;

export function artifactDirectoryPredicate(
  path: string,
  config: ArtifactDirectoryConfig,
): LayerDecision {
  const segments = path.split("/");
  for (const segment of segments) {
    if (config.artifactDirectories.includes(segment)) {
      return { matched: true, layer: LAYER, detail: segment };
    }
  }
  return { matched: false, layer: LAYER };
}
