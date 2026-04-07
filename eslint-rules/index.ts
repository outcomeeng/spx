/**
 * spx Custom ESLint Rules
 *
 * Custom ESLint rules for BDD test behavior and spec-tree compliance.
 */

import noBddTryCatchAntiPattern from "./no-bdd-try-catch-anti-pattern";
import noHardcodedStatuses from "./no-hardcoded-statuses";
import noHardcodedWorkItemKinds from "./no-hardcoded-work-item-kinds";
import noSpecReferences from "./no-spec-references";

const eslintRules = {
  meta: {
    name: "eslint-plugin-spx",
    version: "0.2.0",
    namespace: "spx",
  },
  rules: {
    "no-bdd-try-catch-anti-pattern": noBddTryCatchAntiPattern,
    "no-hardcoded-statuses": noHardcodedStatuses,
    "no-hardcoded-work-item-kinds": noHardcodedWorkItemKinds,
    "no-spec-references": noSpecReferences,
  },
};

export default eslintRules;
