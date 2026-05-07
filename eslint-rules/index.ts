/**
 * spx Custom ESLint Rules
 *
 * Custom ESLint rules for BDD test behavior and spec-tree compliance.
 */

import noAsyncSpawnOutsideLifecycle, {
  NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME,
} from "./no-async-spawn-outside-lifecycle";
import noBareStringUnions, { NO_BARE_STRING_UNIONS_RULE_NAME } from "./no-bare-string-unions";
import noBddTryCatchAntiPattern, {
  NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_NAME,
} from "./no-bdd-try-catch-anti-pattern";
import noDeepRelativeImports, { NO_DEEP_RELATIVE_IMPORTS_RULE_NAME } from "./no-deep-relative-imports";
import noHardcodedStatuses, { NO_HARDCODED_STATUSES_RULE_NAME } from "./no-hardcoded-statuses";
import noHardcodedWorkItemKinds, {
  NO_HARDCODED_WORK_ITEM_KINDS_RULE_NAME,
} from "./no-hardcoded-work-item-kinds";
import noImportSourceExtensions, { NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME } from "./no-import-source-extensions";
import noRegistryPositionAccess, { NO_REGISTRY_POSITION_ACCESS_RULE_NAME } from "./no-registry-position-access";
import noSpecReferences, { NO_SPEC_REFERENCES_RULE_NAME } from "./no-spec-references";
import noTestOwnedDomainConstants, { NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME } from "./no-test-owned-domain-constants";

const eslintRules = {
  meta: {
    name: "eslint-plugin-spx",
    version: "0.2.0",
    namespace: "spx",
  },
  rules: {
    [NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME]: noAsyncSpawnOutsideLifecycle,
    [NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_NAME]: noBddTryCatchAntiPattern,
    [NO_BARE_STRING_UNIONS_RULE_NAME]: noBareStringUnions,
    [NO_DEEP_RELATIVE_IMPORTS_RULE_NAME]: noDeepRelativeImports,
    [NO_HARDCODED_STATUSES_RULE_NAME]: noHardcodedStatuses,
    [NO_HARDCODED_WORK_ITEM_KINDS_RULE_NAME]: noHardcodedWorkItemKinds,
    [NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME]: noImportSourceExtensions,
    [NO_REGISTRY_POSITION_ACCESS_RULE_NAME]: noRegistryPositionAccess,
    [NO_SPEC_REFERENCES_RULE_NAME]: noSpecReferences,
    [NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME]: noTestOwnedDomainConstants,
  },
};

export default eslintRules;
