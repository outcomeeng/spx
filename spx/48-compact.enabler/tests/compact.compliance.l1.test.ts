/**
 * Compact import-boundary compliance: the restriction that keeps the compact
 * domain decoupled from the session domain flags a violating import and passes a
 * clean one. Exercises the `no-restricted-imports` rule (built from the
 * source-owned forbidden list) against violating and compliant fixtures.
 */
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { COMPACT_FORBIDDEN_SESSION_IMPORTS, COMPACT_IMPORT_BOUNDARY_RULE_ID } from "@/domains/compact";

const errorSeverity = 2;
const compliantImport = "import { join } from \"node:path\";";

function restrictedImportConfig(): Linter.Config {
  const paths = COMPACT_FORBIDDEN_SESSION_IMPORTS.flatMap(({ module, names }) =>
    names.map((name) => ({ name: module, importNames: [name] }))
  );
  return { rules: { [COMPACT_IMPORT_BOUNDARY_RULE_ID]: [errorSeverity, { paths }] } };
}

describe("compact import-boundary rule", () => {
  it("flags every forbidden session-domain import", () => {
    const linter = new Linter();
    const config = restrictedImportConfig();

    for (const { module, names } of COMPACT_FORBIDDEN_SESSION_IMPORTS) {
      for (const name of names) {
        const violating = `import { ${name} } from "${module}";`;
        const messages = linter.verify(violating, config);

        expect(messages).toHaveLength(1);
        expect(messages[0]?.ruleId).toBe(COMPACT_IMPORT_BOUNDARY_RULE_ID);
      }
    }
  });

  it("passes an import that is not session-domain coupled", () => {
    const linter = new Linter();

    expect(linter.verify(compliantImport, restrictedImportConfig())).toHaveLength(0);
  });
});
