import {
  formatMethodologyVersionUndeclaredError,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
} from "@/config/methodology";
import type { Result } from "@/config/types";
import { methodologyLine } from "@/lib/methodology";

import { compareNamingSchemaVersions, type NamingSchemaVersion, newestNamingSchemaVersion } from "./config";

/**
 * The naming-schema versions a product's records classify against, and the members its
 * methodology declaration selects: the version serving `methodology.version` is the
 * declared target, and the version serving `methodology.migratingFrom`, while declared,
 * joins it as valid.
 */
export type NamingSchemaSelection = {
  readonly versions: readonly NamingSchemaVersion[];
  readonly selected: readonly NamingSchemaVersion[];
  readonly target: NamingSchemaVersion;
};

/** The methodology declaration fields a selection derives from. */
export type NamingSchemaDeclaration = Pick<MethodologyConfig, "version" | "migratingFrom">;

const LINE_LIST_SEPARATOR = ", ";

/** The methodology lines a version tuple serves, in version order, each listed once. */
export function namingSchemaMethodologyLines(versions: readonly NamingSchemaVersion[]): readonly string[] {
  const ordered = [...versions].sort(compareNamingSchemaVersions);
  return [...new Set(ordered.flatMap((version) => version.methodologyLines))];
}

/** Diagnostic for a declared methodology version on a line no naming-schema version serves. */
export function formatUnreadMethodologyLineError(
  field: string,
  declared: string,
  versions: readonly NamingSchemaVersion[],
): string {
  return `${METHODOLOGY_SECTION}.${field} ${JSON.stringify(declared)} is on a methodology line spx does not read; `
    + `spx reads methodology lines ${namingSchemaMethodologyLines(versions).join(LINE_LIST_SEPARATOR)}`;
}

function versionServing(
  field: string,
  declared: string,
  versions: readonly NamingSchemaVersion[],
): Result<NamingSchemaVersion> {
  const line = methodologyLine(declared);
  if (!line.ok) return line;
  const serving = versions.filter((version) => version.methodologyLines.includes(line.value));
  if (serving.length === 0) {
    return { ok: false, error: formatUnreadMethodologyLineError(field, declared, versions) };
  }
  return { ok: true, value: newestNamingSchemaVersion(serving) };
}

/** The selection a methodology declaration derives over a naming-schema version tuple. */
export function deriveNamingSchemaSelection(
  versions: readonly NamingSchemaVersion[],
  declaration: NamingSchemaDeclaration,
): Result<NamingSchemaSelection> {
  if (declaration.version === undefined) {
    return { ok: false, error: formatMethodologyVersionUndeclaredError() };
  }
  const target = versionServing(METHODOLOGY_CONFIG_FIELDS.VERSION, declaration.version, versions);
  if (!target.ok) return target;
  if (declaration.migratingFrom === undefined) {
    return { ok: true, value: { versions, selected: [target.value], target: target.value } };
  }
  const source = versionServing(METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM, declaration.migratingFrom, versions);
  if (!source.ok) return source;
  const selected = source.value === target.value ? [target.value] : [target.value, source.value];
  return { ok: true, value: { versions, selected, target: target.value } };
}

/** The versions ordered before the declared target's, newest first. */
export function versionsBeforeTarget(selection: NamingSchemaSelection): readonly NamingSchemaVersion[] {
  return selection.versions
    .filter((version) => compareNamingSchemaVersions(version, selection.target) < 0)
    .sort((left, right) => compareNamingSchemaVersions(right, left));
}

/**
 * The node suffixes a selection classifies superseded: those a version ordered before the
 * declared target's accepts, less those any selected version accepts.
 */
export function supersededNodeSuffixes(selection: NamingSchemaSelection): readonly string[] {
  const valid = new Set(selection.selected.flatMap((version) => version.nodeSuffixes));
  const superseded = new Set<string>();
  for (const version of versionsBeforeTarget(selection)) {
    for (const suffix of version.nodeSuffixes) {
      if (!valid.has(suffix)) superseded.add(suffix);
    }
  }
  return [...superseded];
}
