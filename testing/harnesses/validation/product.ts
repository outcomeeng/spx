import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse, stringify } from "yaml";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
} from "@/config/filenames";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { SPEC_TREE_CONFIG, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";

/** The methodology declaration of a validation fixture product that holds a spec tree: the 3.2 line. */
export const VALIDATION_PRODUCT_METHODOLOGY: Config = {
  [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO },
};

function holdsSpecTree(productDir: string): boolean {
  return existsSync(join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY));
}

/**
 * Declares the methodology of a product directory, only where the product holds a spec tree: an `spx/`
 * directory, the condition under which the lint policy and the spec-tree read require a declaration. A product
 * without an `spx/` directory stays undeclared. An existing config file is never replaced: a file in another
 * format is left as it is, and the default-format file gains the methodology section only when it lacks one.
 */
export async function writeValidationProductDeclaration(productDir: string): Promise<void> {
  if (!holdsSpecTree(productDir)) return;
  const defaultPath = join(productDir, CONFIG_FILENAMES.yaml);
  const otherFormatExists = CONFIG_FILE_FORMAT_ORDER.some((format) =>
    format !== CONFIG_FILE_FORMAT.YAML && existsSync(join(productDir, CONFIG_FILE_DEFINITIONS[format].filename))
  );
  if (otherFormatExists) return;
  if (!existsSync(defaultPath)) {
    await writeFile(defaultPath, stringify(VALIDATION_PRODUCT_METHODOLOGY));
    return;
  }
  const existing = (parse(await readFile(defaultPath, "utf8")) ?? {}) as Config;
  if (METHODOLOGY_SECTION in existing) return;
  await writeFile(defaultPath, stringify({ ...existing, ...VALIDATION_PRODUCT_METHODOLOGY }));
}
