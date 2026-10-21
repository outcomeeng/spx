/**
 * Harness for reading generated node specs that carry evidence tags.
 *
 * The in-memory source serves each spec's text and each present link target's text through
 * `readText` and yields the specs' node entries; the filesystem reader writes the same files into
 * a temporary product directory under a 4.0 methodology declaration and reads them through the
 * filesystem source, so an absent link target is a real missing file. Both return the snapshot
 * the read produces, or let its rejection propagate; the linked test states what each must be.
 *
 * @module harnesses/spec-tree/evidence-references
 */

import { posix } from "node:path";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeSnapshot,
  type SpecTreeSource,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import type { EvidenceSpec } from "@testing/generators/spec-tree/evidence-references";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

/** A source that yields the specs' node entries and reads text for exactly the files the specs occupy. */
export function createEvidenceTextSource(specs: readonly EvidenceSpec[]): SpecTreeSource {
  const texts = new Map(specs.flatMap(({ files }) => files).map(({ path, contents }) => [path, contents]));
  return {
    async *entries() {
      yield* specs.map(({ entry }) => entry);
    },
    async readText(ref) {
      const text = ref.path === undefined ? undefined : texts.get(ref.path);
      if (text === undefined) {
        throw new Error(`The evidence text source holds no file for ref ${ref.id}`);
      }
      return text;
    },
  };
}

/** The snapshot a read of the specs through the in-memory text source produces. */
export function readEvidenceSpecsFromMemory(specs: readonly EvidenceSpec[]): Promise<SpecTreeSnapshot> {
  return readSpecTree({ source: createEvidenceTextSource(specs) });
}

/** The snapshot a read of the specs through a source that exposes entries and no `readText` produces. */
export function readEvidenceSpecsWithoutReadText(specs: readonly EvidenceSpec[]): Promise<SpecTreeSnapshot> {
  const { entries } = createEvidenceTextSource(specs);
  return readSpecTree({ source: { entries } });
}

/**
 * The snapshot a read produces when the source rejects reading a node's own spec with a failure
 * that is not a missing file. The rejection propagates.
 */
export function readEvidenceSpecsWithUnreadableSpec(specs: readonly EvidenceSpec[]): Promise<SpecTreeSnapshot> {
  const source = createEvidenceTextSource(specs);
  const specPaths = new Set(specs.map(({ specPath }) => specPath));
  return readSpecTree({
    source: {
      entries: source.entries.bind(source),
      readText: (ref) =>
        ref.path !== undefined && specPaths.has(ref.path)
          ? Promise.reject(Object.assign(new Error(`cannot read ${ref.path}`), { code: "EACCES" }))
          : source.readText!(ref),
    },
  });
}

/** The snapshot a read of the specs written into a temporary product directory produces. */
export function readEvidenceSpecsFromFilesystem(specs: readonly EvidenceSpec[]): Promise<SpecTreeSnapshot> {
  return readEvidenceSpecsFromFilesystemWith(specs, false);
}

/**
 * The snapshot a read produces when every present link target is a directory, so the filesystem
 * source rejects reading it with a failure that is not a missing file. The rejection propagates.
 */
export function readEvidenceSpecsWithUnreadableTargets(specs: readonly EvidenceSpec[]): Promise<SpecTreeSnapshot> {
  return readEvidenceSpecsFromFilesystemWith(specs, true);
}

function readEvidenceSpecsFromFilesystemWith(
  specs: readonly EvidenceSpec[],
  targetsAreDirectories: boolean,
): Promise<SpecTreeSnapshot> {
  const specPaths = new Set(specs.map(({ specPath }) => specPath));
  return withTestEnv(
    {
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
      },
    },
    async (env) => {
      for (const { path, contents } of specs.flatMap(({ files }) => files)) {
        await env.writeRaw(targetsAreDirectories && !specPaths.has(path) ? posix.join(path, path) : path, contents);
      }
      return readSpecTree({ source: createFilesystemSpecTreeSource({ productDir: env.productDir }) });
    },
  );
}
