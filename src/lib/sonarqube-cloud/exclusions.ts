/**
 * Fixture-exclusion drift logic for SonarQube Cloud automatic analysis.
 *
 * SonarQube Cloud automatic analysis reads `.sonarcloud.properties` but does not
 * accept wildcard patterns, so the test-fixture exclusion is a hand-enumerated
 * exact-path list. This module parses that list and compares it to the tracked
 * files under the fixture root, so a Lefthook pre-commit hook can block a commit
 * whose exclusion list has drifted from the fixture tree.
 *
 * All logic here is pure: the git listing and the `.sonarcloud.properties` read are
 * supplied by the caller through {@link ExclusionCheckDeps}.
 *
 * @module lib/sonarqube-cloud/exclusions
 */

/** Repository-relative root of the deliberate test fixtures. */
export const FIXTURE_ROOT = "testing/fixtures";

/** The `.sonarcloud.properties` key whose value lists excluded paths. */
export const SONAR_EXCLUSIONS_KEY = "sonar.exclusions";

const PROPERTIES_COMMENT_PREFIXES = ["#", "!"] as const;
const PROPERTIES_CONTINUATION = "\\";
const ENTRY_SEPARATOR = ",";
const KEY_VALUE_SEPARATOR = "=";

/** Exit codes the pre-commit entrypoint maps from a check result. */
export const EXCLUSION_CHECK_EXIT = {
  CLEAN: 0,
  DRIFT: 1,
} as const;

/** The two directions a drifted exclusion list can differ from the fixture tree. */
export interface ExclusionDrift {
  /** Tracked fixture files absent from the exclusion entries. */
  readonly missing: string[];
  /** Fixture-scoped exclusion entries with no matching tracked file. */
  readonly extra: string[];
}

/** Boundary dependencies the check reads through, injected for isolated verification. */
export interface ExclusionCheckDeps {
  /** Returns the raw contents of `.sonarcloud.properties`. */
  readonly readProperties: () => string;
  /** Returns the tracked files under {@link FIXTURE_ROOT} (e.g. `git ls-files`). */
  readonly listTrackedFixtureFiles: () => readonly string[];
}

/** Outcome of a fixture-exclusion check. */
export interface ExclusionCheckResult {
  /** True when the exclusion list lists exactly the tracked fixture files. */
  readonly ok: boolean;
  /** The drift between the exclusion list and the fixture tree. */
  readonly drift: ExclusionDrift;
}

/** Sort comparator for repository-relative paths. */
export function comparePathEntries(left: string, right: string): number {
  return left.localeCompare(right);
}

function isUnderFixtureRoot(path: string): boolean {
  return path === FIXTURE_ROOT || path.startsWith(`${FIXTURE_ROOT}/`);
}

/**
 * Collapse Java `.properties` backslash line continuation into logical lines.
 * Leading whitespace on a continuation line is stripped, per the `.properties` format.
 */
function hasLineContinuation(line: string): boolean {
  let trailingBackslashes = 0;
  for (let index = line.length - 1; index >= 0 && line[index] === PROPERTIES_CONTINUATION; index -= 1) {
    trailingBackslashes += 1;
  }
  return trailingBackslashes % 2 === 1;
}

function toLogicalLines(propertiesText: string): string[] {
  const logicalLines: string[] = [];
  let buffer = "";
  let continuing = false;

  for (const rawLine of propertiesText.split("\n")) {
    const line = continuing ? rawLine.replace(/^\s+/, "") : rawLine;
    if (hasLineContinuation(line)) {
      buffer += line.slice(0, -PROPERTIES_CONTINUATION.length);
      continuing = true;
      continue;
    }
    buffer += line;
    logicalLines.push(buffer);
    buffer = "";
    continuing = false;
  }
  if (buffer.length > 0) {
    logicalLines.push(buffer);
  }
  return logicalLines;
}

/**
 * Parse the `sonar.exclusions` value from `.sonarcloud.properties` text into its
 * list of path entries, resolving line continuation and ignoring comments and
 * other keys. Returns an empty list when the key is absent.
 */
export function parseSonarExclusions(propertiesText: string): string[] {
  let exclusions: string[] = [];
  for (const logicalLine of toLogicalLines(propertiesText)) {
    const trimmed = logicalLine.trim();
    if (trimmed.length === 0 || PROPERTIES_COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(KEY_VALUE_SEPARATOR);
    if (separatorIndex === -1) {
      continue;
    }
    if (trimmed.slice(0, separatorIndex).trim() !== SONAR_EXCLUSIONS_KEY) {
      continue;
    }
    exclusions = trimmed
      .slice(separatorIndex + KEY_VALUE_SEPARATOR.length)
      .split(ENTRY_SEPARATOR)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return exclusions;
}

/**
 * Compute the drift between the tracked fixture files and the fixture-scoped
 * exclusion entries. Exclusion entries outside {@link FIXTURE_ROOT} are ignored —
 * they are not fixture inputs and never count as drift.
 */
export function computeFixtureExclusionDrift(params: {
  readonly trackedFixtureFiles: readonly string[];
  readonly exclusionEntries: readonly string[];
}): ExclusionDrift {
  const tracked = new Set(params.trackedFixtureFiles);
  const fixtureEntries = new Set(params.exclusionEntries.filter(isUnderFixtureRoot));
  const missing = [...tracked].filter((file) => !fixtureEntries.has(file)).sort(comparePathEntries);
  const extra = [...fixtureEntries].filter((entry) => !tracked.has(entry)).sort(comparePathEntries);
  return { missing, extra };
}

/**
 * Run the fixture-exclusion check: parse the exclusions, list the tracked fixtures,
 * and report whether they agree.
 */
export function checkFixtureExclusions(deps: ExclusionCheckDeps): ExclusionCheckResult {
  const drift = computeFixtureExclusionDrift({
    trackedFixtureFiles: deps.listTrackedFixtureFiles(),
    exclusionEntries: parseSonarExclusions(deps.readProperties()),
  });
  return { ok: drift.missing.length === 0 && drift.extra.length === 0, drift };
}

/**
 * Render a human-readable report of a drifted check result, naming the offending
 * paths so a developer can reconcile the exclusion list with the fixture tree.
 */
export function formatDriftReport(drift: ExclusionDrift): string {
  const lines = [`${SONAR_EXCLUSIONS_KEY} is out of sync with ${FIXTURE_ROOT}:`];
  for (const file of drift.missing) {
    lines.push(`  + tracked but not excluded: ${file}`);
  }
  for (const entry of drift.extra) {
    lines.push(`  - excluded but not tracked: ${entry}`);
  }
  lines.push(`Regenerate the list from: git ls-files ${FIXTURE_ROOT}`);
  return lines.join("\n");
}
