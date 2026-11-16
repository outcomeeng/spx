/**
 * The literal directory layout the write-path report Mapping of
 * `spx/34-verification.enabler/32-verify.enabler/verify.md` states, one product-root-relative
 * template per directory role, copied from the Mapping's table rather than built from the
 * production path helpers, so a path segment the report and `start` share cannot also shape the
 * expectation.
 */
export const WRITE_PATH_REPORT_MAPPING = {
  "journal-runs": ".spx/branch/<branch-slug>/<verification-type>/runs/",
  "verification-context": ".spx/branch/<branch-slug>/verification-context/contexts/",
  payloads: ".spx/branch/<branch-slug>/<verification-type>/payloads/",
} as const;

/** The placeholders the Mapping's templates carry, each replaced by the value the run is keyed by. */
export const WRITE_PATH_REPORT_PLACEHOLDER = {
  BRANCH_SLUG: "<branch-slug>",
  VERIFICATION_TYPE: "<verification-type>",
} as const;

/** The separator of the Mapping's templates, independent of the host's path separator. */
export const WRITE_PATH_REPORT_SEPARATOR = "/";
