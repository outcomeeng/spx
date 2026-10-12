import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stringify } from "yaml";

import { CONFIG_FILENAMES } from "@/config/filenames";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { type LiteralFixtureEnv, withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

/** The methodology declaration of every validation fixture product: the 3.2 line, which a tracked spec tree must declare. */
export const VALIDATION_PRODUCT_METHODOLOGY: Config = {
  [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO },
};

/**
 * Runs the callback against a temporary validation product whose configuration declares its methodology
 * version beside the supplied sections. A supplied `methodology` section takes precedence.
 */
export function withValidationProduct<T>(
  config: Config,
  callback: (env: SpecTreeEnv) => Promise<T>,
): Promise<T> {
  return withTestEnv({ ...VALIDATION_PRODUCT_METHODOLOGY, ...config }, callback);
}

/** Writes the methodology declaration into an existing product directory, as the product's default-format config file. */
export async function writeValidationProductDeclaration(productDir: string): Promise<void> {
  await writeFile(join(productDir, CONFIG_FILENAMES.yaml), stringify(VALIDATION_PRODUCT_METHODOLOGY));
}

/** Runs the callback against a temporary git-tracked validation product that declares its methodology version beside the supplied sections. */
export function withValidationLiteralProduct<T>(
  config: Config,
  callback: (env: LiteralFixtureEnv) => Promise<T>,
): Promise<T> {
  return withLiteralFixtureEnv({ ...VALIDATION_PRODUCT_METHODOLOGY, ...config }, callback);
}
