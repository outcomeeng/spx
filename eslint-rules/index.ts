/**
 * spx Custom ESLint Rules
 *
 * Custom ESLint rules for BDD test behavior and spec-tree compliance.
 */

import noBareStringUnions, { NO_BARE_STRING_UNIONS_RULE_NAME } from "./no-bare-string-unions";
import noBddTryCatchAntiPattern from "./no-bdd-try-catch-anti-pattern";
import noDeepRelativeImports, { NO_DEEP_RELATIVE_IMPORTS_RULE_NAME } from "./no-deep-relative-imports";
import noHardcodedStatuses from "./no-hardcoded-statuses";
import noHardcodedWorkItemKinds from "./no-hardcoded-work-item-kinds";
import noImportSourceExtensions, { NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME } from "./no-import-source-extensions";
import noSpecReferences from "./no-spec-references";

const eslintRules = {
  meta: {
    name: "eslint-plugin-spx",
    version: "0.2.0",
    namespace: "spx",
  },
  rules: {
    "no-bdd-try-catch-anti-pattern": noBddTryCatchAntiPattern,
    [NO_BARE_STRING_UNIONS_RULE_NAME]: noBareStringUnions,
    [NO_DEEP_RELATIVE_IMPORTS_RULE_NAME]: noDeepRelativeImports,
    "no-hardcoded-statuses": noHardcodedStatuses,
    "no-hardcoded-work-item-kinds": noHardcodedWorkItemKinds,
    [NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME]: noImportSourceExtensions,
    "no-spec-references": noSpecReferences,
  },
};

export default eslintRules;
