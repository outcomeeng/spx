/**
 * Controlled violating implementations of the canonical naming-schema version signature.
 *
 * Exception case 7, contract probes: each implementation honours the signature of
 * `canonicalNamingSchemaVersion` while breaking its contract in one named way, so the
 * naming-version tests can show that the constructed tuples reject each violation. The
 * implementations return observations only; the test decides what each observation means.
 *
 * @module harnesses/spec-tree/naming-version-violations
 */

import { type NamingSchemaVersion, SPEC_TREE_NAMING_VERSION } from "@/lib/spec-tree";

export type CanonicalVersionImplementation = (versions: readonly NamingSchemaVersion[]) => NamingSchemaVersion;

export const takeFirstVersion: CanonicalVersionImplementation = (versions) => versions[0];

export const takeLastVersion: CanonicalVersionImplementation = (versions) => versions[versions.length - 1];

export const hardCodedVersion: CanonicalVersionImplementation = (versions) => ({
  ...versions[0],
  version: SPEC_TREE_NAMING_VERSION,
});
