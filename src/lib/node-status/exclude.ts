import type { IgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";

type NodeStatusExclusionEntry = {
  readonly ref?: {
    readonly path?: string;
  };
};

export function isNodeStatusEntryExcluded(
  ignoreReader: IgnoreSourceReader,
  node: NodeStatusExclusionEntry,
): boolean {
  const reference = node.ref?.path;
  if (reference === undefined) return false;
  return ignoreReader.isUnderIgnoreSource(reference);
}
