import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Result } from "@/config/types";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PACKAGE_DIRECTORY = "methodology-package";
const CORE_PATH = "skills/understand/SKILL.md";
const COMPACT_RECOVERY_PATH = "skills/understand/compact-recovery.md";
const ESCAPE_TARGET_FILENAME = "outside-directive.md";
const TEMP_PREFIX = "compact-recovery-";

/** The materialized-package states the directive resolution mapping exercises. */
export const COMPACT_RECOVERY_FIXTURE_VARIANT = {
  RESOLVED: "resolved",
  PACKAGE_UNCONFIGURED: "package-unconfigured",
  MANIFEST_ABSENT: "manifest-absent",
  MANIFEST_INVALID: "manifest-invalid",
  ENTRY_ABSENT: "entry-absent",
  RESOURCE_MISSING: "resource-missing",
  RESOURCE_ESCAPING: "resource-escaping",
} as const;

export type CompactRecoveryFixtureVariant =
  (typeof COMPACT_RECOVERY_FIXTURE_VARIANT)[keyof typeof COMPACT_RECOVERY_FIXTURE_VARIANT];

export interface CompactRecoveryPackageFixture {
  /** The temp product directory the package sits under. */
  readonly productDir: string;
  /** The product-relative package directory, or undefined for the unconfigured variant. */
  readonly packageDir: string | undefined;
  /** The absolute path of the written manifest file. */
  readonly manifestPath: string;
  /** The package-relative compact-recovery entry the manifest names. */
  readonly entryPath: string;
  /** The exact directive text the resolved variant's resource carries. */
  readonly directiveText: string;
}

function manifestJson(compactRecovery?: string): string {
  return JSON.stringify({
    [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
    [FOUNDATION_MANIFEST_FIELDS.CORE]: CORE_PATH,
    [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [],
    [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [],
    [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [],
    ...(compactRecovery === undefined ? {} : { [FOUNDATION_MANIFEST_FIELDS.COMPACT_RECOVERY]: compactRecovery }),
  });
}

async function writePackageFile(packageRoot: string, relativePath: string, content: string): Promise<string> {
  const absolute = join(packageRoot, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return absolute;
}

/**
 * Materializes one installed-methodology-package state under a temp product
 * directory and hands its locations to the callback. The callback owns every
 * assertion; the harness only builds and removes the fixture.
 */
export async function withCompactRecoveryPackage(
  options: { readonly directiveText: string; readonly variant: CompactRecoveryFixtureVariant },
  callback: (fixture: CompactRecoveryPackageFixture) => Promise<void>,
): Promise<void> {
  await withTempDir(TEMP_PREFIX, async (productDir) => {
    const packageRoot = join(productDir, PACKAGE_DIRECTORY);
    const manifestPath = join(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH);
    await mkdir(packageRoot, { recursive: true });

    switch (options.variant) {
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        await writePackageFile(packageRoot, CORE_PATH, options.directiveText);
        await writePackageFile(packageRoot, COMPACT_RECOVERY_PATH, options.directiveText);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.PACKAGE_UNCONFIGURED:
      case COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_ABSENT: {
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_INVALID: {
        // A leading brace with no closing structure cannot parse as JSON whatever the text.
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, `{${options.directiveText}`);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.ENTRY_ABSENT: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson());
        await writePackageFile(packageRoot, CORE_PATH, options.directiveText);
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_MISSING: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        break;
      }
      case COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_ESCAPING: {
        await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
        const escapeTarget = join(productDir, ESCAPE_TARGET_FILENAME);
        await writeFile(escapeTarget, options.directiveText, "utf8");
        const linkPath = join(packageRoot, COMPACT_RECOVERY_PATH);
        await mkdir(dirname(linkPath), { recursive: true });
        await symlink(escapeTarget, linkPath);
        break;
      }
    }

    await callback({
      productDir,
      packageDir: options.variant === COMPACT_RECOVERY_FIXTURE_VARIANT.PACKAGE_UNCONFIGURED
        ? undefined
        : PACKAGE_DIRECTORY,
      manifestPath,
      entryPath: COMPACT_RECOVERY_PATH,
      directiveText: options.directiveText,
    });
  });
}

/**
 * Materializes the resolved-variant installed methodology package under an
 * existing product directory and returns the product-relative package
 * directory a `methodology.packageDir` declaration points at.
 */
export async function writeResolvedCompactRecoveryPackage(
  productDir: string,
  directiveText: string,
): Promise<{ readonly packageDir: string }> {
  const packageRoot = join(productDir, PACKAGE_DIRECTORY);
  await writePackageFile(packageRoot, FOUNDATION_MANIFEST_RELATIVE_PATH, manifestJson(COMPACT_RECOVERY_PATH));
  await writePackageFile(packageRoot, CORE_PATH, directiveText);
  await writePackageFile(packageRoot, COMPACT_RECOVERY_PATH, directiveText);
  return { packageDir: PACKAGE_DIRECTORY };
}

export interface RecordingCompactDirectiveResolver {
  readonly resolver: (productDir: string) => Promise<Result<string>>;
  /** One entry per invocation: the product directory the adapter resolved against. */
  readonly invocations: readonly string[];
}

/** A recording resolver: returns the supplied directive and records each invocation for the test to judge. */
export function createRecordingCompactDirectiveResolver(directiveText: string): RecordingCompactDirectiveResolver {
  const invocations: string[] = [];
  return {
    invocations,
    resolver: (productDir: string) => {
      invocations.push(productDir);
      return Promise.resolve({ ok: true, value: directiveText });
    },
  };
}
