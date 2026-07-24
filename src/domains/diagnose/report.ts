/**
 * Diagnose report rendering — emits the folded report as machine-readable JSON
 * or as a human-readable text form rendered through the shared styled-output
 * primitive. JSON carries the complete machine schema; text translates the
 * same check records into a human diagnosis. Pure over the report and the color
 * choice; no I/O.
 *
 * @module domains/diagnose/report
 */

import {
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallVerdict,
} from "@/domains/diagnose/checks/marketplace-install";
import {
  METHODOLOGY_CONTEXT_VERDICT,
  type MethodologyContextVerdict,
} from "@/domains/diagnose/checks/methodology-context";
import {
  SESSION_ENVIRONMENT_VERDICT,
  type SessionEnvironmentVerdict,
} from "@/domains/diagnose/checks/session-environment";
import { SESSION_STORE_VERDICT, type SessionStoreVerdict } from "@/domains/diagnose/checks/session-store";
import {
  SPX_REACHABILITY_READING_VALUE,
  SPX_REACHABILITY_VERDICT,
  type SpxReachabilityVerdict,
} from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT, type WorktreePoolVerdict } from "@/domains/diagnose/checks/worktree-pool";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { BUCKET_SEVERITY, CANONICAL_CHECKOUT_PROBLEM, OVERALL_SEVERITY } from "@/domains/diagnose/report-contract";
import { type CheckRecord, type DiagnoseReport } from "@/domains/diagnose/types";
import {
  renderStyledReport,
  type StyledReportModel,
  type StyledReportOptions,
} from "@/lib/styled-output/styled-output";
import { authoredText, renderTerminalText, terminal, type TerminalText } from "@/lib/terminal-text/terminal-text";

/** The output formats `spx diagnose` emits. */
export const DIAGNOSE_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export type DiagnoseFormat = (typeof DIAGNOSE_FORMAT)[keyof typeof DIAGNOSE_FORMAT];

/** The label the text report prefixes the diagnosis line with. */
export const DIAGNOSE_TEXT_OVERALL_LABEL = "Diagnosis";

/** The count a check reports when it gathered no count reading. */
const WORKTREE_COUNT_ZERO = "0";

export interface DiagnoseHumanText {
  readonly header: string;
  readonly details: readonly string[];
}

export const DIAGNOSE_TEXT_LABEL = {
  FIX: "Fix",
  INSTALLED: "Installed",
  CONFIGURED_SOURCE: "Configured source",
  CONFIGURED_VERSION: "Configured version",
  OBSERVED_VERSION: "Observed version",
  PATH: "Path",
  PROBLEM: "Problem",
  REQUIRED_VERSION: "Required version",
  ORPHANED_DOING_SESSIONS: "Unmatched doing sessions",
  VERSION: "Version",
  WORKTREES: "Worktrees",
} as const;

export const DIAGNOSE_TEXT_HEADER = {
  AGENT_SESSION_ACTIVE: "agent session active",
  AGENT_SESSION_HOOK_SKIPPED: "agent session hook skipped",
  AGENT_SESSION_UNLINKED: "agent session is not linked to this worktree",
  AGENT_SESSION_UNKNOWN: "agent session state unknown",
  MARKETPLACE_CHECKS_SKIPPED: "plugin marketplace checks skipped",
  MARKETPLACE_CLI_UNAVAILABLE: "plugin CLI unavailable",
  MARKETPLACE_CONFIGURED: "plugin marketplace configured",
  MARKETPLACE_DRIFT: "plugin installation drift",
  MARKETPLACE_UNREGISTERED: "plugin marketplace unregistered",
  MARKETPLACE_UNKNOWN: "plugin marketplace state unknown",
  METHODOLOGY_BOOTSTRAP_IDENTITY: "methodology identity undeclared",
  METHODOLOGY_RESOLVED: "methodology context resolved",
  METHODOLOGY_UNAVAILABLE: "methodology context unavailable",
  METHODOLOGY_UNKNOWN: "methodology context unknown",
  METHODOLOGY_VERSION_MISMATCH: "methodology version mismatch",
  RENDERING_UNAVAILABLE: "diagnosis detail unavailable",
  SESSION_START_NO_OP: "SessionStart hook did not establish a session",
  SESSION_STORE_CLEAN: "session store readable",
  SESSION_STORE_UNKNOWN: "session store state unknown",
  SPX_BELOW_FLOOR: "spx version below required floor",
  SPX_INSTALLED: "spx installed",
  SPX_UNREACHABLE: "spx is not on PATH",
  SPX_UNKNOWN: "spx install state unknown",
  WORKTREE_POOL_INVALID: "worktree pool invalid",
  WORKTREE_POOL_UNKNOWN: "worktree pool state unknown",
  WORKTREE_POOL_VALID: "worktree pool valid",
} as const;

export const DIAGNOSE_TEXT_DETAIL = {
  AGENT_SESSION_ACTIVE: "Agent session identity and worktree claim are both present.",
  AGENT_SESSION_SKIPPED: "No agent session is active in this shell.",
  AGENT_SESSION_UNLINKED_PROBLEM: "this shell has an agent session identity, but the current worktree is not claimed.",
  AGENT_SESSION_UNLINKED_FIX: "re-run the SessionStart hook or claim a live worktree before relying on session state.",
  MARKETPLACE_CLI_UNAVAILABLE_FIX: "Install or enable the Claude or Codex plugin CLI, then rerun `spx diagnose`.",
  MARKETPLACE_CLI_UNAVAILABLE_PROBLEM:
    "A marketplace check is configured, but no plugin CLI is available to inspect it.",
  MARKETPLACE_CONFIGURED: "Configured plugins are installed and enabled.",
  METHODOLOGY_BOOTSTRAP_IDENTITY_PROBLEM:
    "this product carries a tracked spec tree but declares the bootstrap methodology sentinel, so its methodology identity is not durable.",
  METHODOLOGY_BOOTSTRAP_IDENTITY_FIX: "declare an exact top-level methodology.version in spx.config.",
  METHODOLOGY_RESOLVED: "Configured methodology context is visible to the local agent runtime.",
  METHODOLOGY_UNAVAILABLE_FIX: "Install the configured methodology source or adjust top-level methodology config.",
  METHODOLOGY_VERSION_MISMATCH_FIX:
    "Install the configured methodology version or change top-level methodology.version.",
  MARKETPLACE_SKIPPED: "Plugin marketplace checks are not configured.",
  RENDERING_UNAVAILABLE: "This check produced a record this version cannot translate into diagnosis text.",
  SESSION_STORE_INFORMATIONAL: "This count is informational and requires no session action.",
  SPX_BELOW_FLOOR_FIX: "update spx to at least the required version.",
  SESSION_START_NO_OP_PROBLEM:
    "SPX_WORKTREE_CLAIM_PATH is present, but no agent session identity or running worktree claim was found.",
  SESSION_START_NO_OP_FIX:
    "verify the agent session is current, re-run the SessionStart hook, or check whether the worktree claim file is stale.",
  SPX_UNKNOWN_FIX:
    "Verify the configured or manifest-supplied `spx_floor` and `spx --version` are valid semver versions.",
  SPX_UNKNOWN_PROBLEM: "Diagnose could not compare the installed spx version with the required version.",
  SESSION_UNKNOWN_PROBLEM: "Diagnose could not reconcile the agent session identity with the worktree claim.",
  SPX_UNREACHABLE_FIX: "Install `@outcomeeng/spx` and ensure `spx` resolves on PATH.",
  UNKNOWN_RETRY: "Re-run `spx diagnose`; inspect the relevant command output if this repeats.",
  UNREGISTERED_MARKETPLACE_FIX: "Register the configured plugin marketplace.",
  WORKTREE_POOL_VALID: "Layout is valid for shared session work.",
  WORKTREE_POOL_NON_COMPLIANT_PROBLEM: "linked worktrees are attached to a non-bare repository.",
  WORKTREE_POOL_NON_COMPLIANT_FIX: "convert to a bare-repository worktree pool or remove the linked worktrees.",
  MARKETPLACE_DRIFT_FIX: "install or enable the expected plugins.",
} as const;

/** Renders the report as indented JSON: a per-check record array plus the overall verdict. */
export function renderReportJson(report: DiagnoseReport): string {
  return JSON.stringify(
    {
      checks: report.checks.map((check) => ({
        name: check.name,
        verdict: check.verdict,
        bucket: check.bucket,
        readings: check.readings,
        remediation: check.remediation,
      })),
      overall: report.overall,
    },
    null,
    2,
  );
}

function methodologyContextText(check: CheckRecord): DiagnoseHumanText {
  const configuredSource = reading(check, "configuredSource");
  const configuredVersion = reading(check, "configuredVersion");
  const observedVersion = reading(check, "observedVersion");
  switch (check.verdict as MethodologyContextVerdict) {
    case METHODOLOGY_CONTEXT_VERDICT.RESOLVED:
      return {
        header: DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED,
        details: [
          DIAGNOSE_TEXT_DETAIL.METHODOLOGY_RESOLVED,
          detail(DIAGNOSE_TEXT_LABEL.CONFIGURED_SOURCE, configuredSource),
          detail(DIAGNOSE_TEXT_LABEL.OBSERVED_VERSION, observedVersion),
        ],
      };
    case METHODOLOGY_CONTEXT_VERDICT.BOOTSTRAP_IDENTITY:
      return {
        header: DIAGNOSE_TEXT_HEADER.METHODOLOGY_BOOTSTRAP_IDENTITY,
        details: [
          detail(
            DIAGNOSE_TEXT_LABEL.PROBLEM,
            authoredText(DIAGNOSE_TEXT_DETAIL.METHODOLOGY_BOOTSTRAP_IDENTITY_PROBLEM),
          ),
          detail(DIAGNOSE_TEXT_LABEL.CONFIGURED_VERSION, configuredVersion),
          detail(DIAGNOSE_TEXT_LABEL.OBSERVED_VERSION, observedVersion),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.METHODOLOGY_BOOTSTRAP_IDENTITY_FIX)),
        ],
      };
    case METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH:
      return {
        header: DIAGNOSE_TEXT_HEADER.METHODOLOGY_VERSION_MISMATCH,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.CONFIGURED_VERSION, configuredVersion),
          detail(DIAGNOSE_TEXT_LABEL.OBSERVED_VERSION, observedVersion),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.METHODOLOGY_VERSION_MISMATCH_FIX)),
        ],
      };
    case METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE:
      return {
        header: DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNAVAILABLE,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.CONFIGURED_SOURCE, configuredSource),
          detail(DIAGNOSE_TEXT_LABEL.CONFIGURED_VERSION, configuredVersion),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.METHODOLOGY_UNAVAILABLE_FIX)),
        ],
      };
    case METHODOLOGY_CONTEXT_VERDICT.UNKNOWN:
      return {
        header: DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNKNOWN,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNKNOWN_RETRY))],
      };
    default:
      return fallbackText(check);
  }
}

/**
 * A check reading is external — a resolved PATH entry, a `spx --version`
 * stdout, a configured source, a plugin-CLI response. Returning it already
 * composed means every detail line built from a reading is escaped by
 * construction rather than by remembering to escape at each use.
 */
function reading(check: CheckRecord, key: string): TerminalText | undefined {
  const value = check.readings[key];
  return value === undefined ? undefined : terminal`${value}`;
}

/**
 * Builds one `label: value` detail line. Both sides arrive already composed, so
 * a caller states whether its value is product-authored or external instead of
 * letting the builder assume; an absent value resolves to the escaper's
 * undefined sentinel.
 */
function detail(label: string, value: TerminalText | undefined): string {
  return renderTerminalText(terminal`${authoredText(label)}: ${value}`);
}

function spxReachabilityText(check: CheckRecord): DiagnoseHumanText {
  const version = reading(check, "version");
  const path = reading(check, "path");
  const floor = reading(check, "floor");
  switch (check.verdict as SpxReachabilityVerdict) {
    case SPX_REACHABILITY_VERDICT.REACHABLE:
    case SPX_REACHABILITY_VERDICT.PRESENT:
      return {
        header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.VERSION, version ?? authoredText(SPX_REACHABILITY_READING_VALUE.UNREAD_VERSION)),
          detail(DIAGNOSE_TEXT_LABEL.PATH, path ?? authoredText(SPX_REACHABILITY_READING_VALUE.UNRESOLVED_PATH)),
        ],
      };
    case SPX_REACHABILITY_VERDICT.BELOW_FLOOR:
      return {
        header: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.INSTALLED, version ?? authoredText(SPX_REACHABILITY_READING_VALUE.UNREAD_VERSION)),
          detail(
            DIAGNOSE_TEXT_LABEL.REQUIRED_VERSION,
            floor ?? authoredText(SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR),
          ),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.SPX_BELOW_FLOOR_FIX)),
        ],
      };
    case SPX_REACHABILITY_VERDICT.UNREACHABLE:
      return {
        header: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.SPX_UNREACHABLE_FIX))],
      };
    case SPX_REACHABILITY_VERDICT.UNKNOWN:
      return {
        header: DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_PROBLEM)),
          detail(DIAGNOSE_TEXT_LABEL.INSTALLED, version ?? authoredText(SPX_REACHABILITY_READING_VALUE.UNREAD_VERSION)),
          detail(
            DIAGNOSE_TEXT_LABEL.REQUIRED_VERSION,
            floor ?? authoredText(SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR),
          ),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_FIX)),
        ],
      };
    default:
      return fallbackText(check);
  }
}

function sessionEnvironmentText(check: CheckRecord): DiagnoseHumanText {
  switch (check.verdict as SessionEnvironmentVerdict) {
    case SESSION_ENVIRONMENT_VERDICT.WORKING:
      return {
        header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_ACTIVE,
        details: [DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_ACTIVE],
      };
    case SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY:
      return {
        header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNLINKED,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_UNLINKED_PROBLEM)),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_UNLINKED_FIX)),
        ],
      };
    case SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP:
      return {
        header: DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_PROBLEM)),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_FIX)),
        ],
      };
    case SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE:
      return {
        header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED,
        details: [DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_SKIPPED],
      };
    case SESSION_ENVIRONMENT_VERDICT.UNKNOWN:
      return {
        header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNKNOWN,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.SESSION_UNKNOWN_PROBLEM)),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNKNOWN_RETRY)),
        ],
      };
    default:
      return fallbackText(check);
  }
}

function worktreePoolText(check: CheckRecord): DiagnoseHumanText {
  const running = reading(check, "running") ?? authoredText(WORKTREE_COUNT_ZERO);
  const free = reading(check, "free") ?? authoredText(WORKTREE_COUNT_ZERO);
  switch (check.verdict as WorktreePoolVerdict) {
    case WORKTREE_POOL_VERDICT.COMPLIANT:
      return {
        header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.WORKTREES, terminal`${running} active, ${free} free`),
          DIAGNOSE_TEXT_DETAIL.WORKTREE_POOL_VALID,
        ],
      };
    case WORKTREE_POOL_VERDICT.NON_COMPLIANT:
      return {
        header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.WORKTREE_POOL_NON_COMPLIANT_PROBLEM)),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.WORKTREE_POOL_NON_COMPLIANT_FIX)),
        ],
      };
    case WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING:
      return {
        header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
        details: [
          detail(
            DIAGNOSE_TEXT_LABEL.PROBLEM,
            authoredText(CANONICAL_CHECKOUT_PROBLEM[WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING]),
          ),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(check.remediation)),
        ],
      };
    case WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED:
      return {
        header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
        details: [
          detail(
            DIAGNOSE_TEXT_LABEL.PROBLEM,
            authoredText(CANONICAL_CHECKOUT_PROBLEM[WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED]),
          ),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(check.remediation)),
        ],
      };
    case WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH:
      return {
        header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
        details: [
          detail(
            DIAGNOSE_TEXT_LABEL.PROBLEM,
            authoredText(CANONICAL_CHECKOUT_PROBLEM[WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH]),
          ),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(check.remediation)),
        ],
      };
    case WORKTREE_POOL_VERDICT.UNKNOWN:
      return {
        header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNKNOWN_RETRY))],
      };
    default:
      return fallbackText(check);
  }
}

function sessionStoreText(check: CheckRecord): DiagnoseHumanText {
  const orphaned = reading(check, "orphaned") ?? authoredText(WORKTREE_COUNT_ZERO);
  switch (check.verdict as SessionStoreVerdict) {
    case SESSION_STORE_VERDICT.CONSISTENT:
      return {
        header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.ORPHANED_DOING_SESSIONS, orphaned),
          DIAGNOSE_TEXT_DETAIL.SESSION_STORE_INFORMATIONAL,
        ],
      };
    case SESSION_STORE_VERDICT.UNKNOWN:
      return {
        header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_UNKNOWN,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNKNOWN_RETRY))],
      };
    default:
      return fallbackText(check);
  }
}

function marketplaceInstallText(check: CheckRecord): DiagnoseHumanText {
  switch (check.verdict as MarketplaceInstallVerdict) {
    case MARKETPLACE_INSTALL_VERDICT.INSTALLED:
      return {
        header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CONFIGURED,
        details: [DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CONFIGURED],
      };
    case MARKETPLACE_INSTALL_VERDICT.DRIFTED:
      return {
        header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_DRIFT,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_DRIFT_FIX))],
      };
    case MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE:
      return {
        header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE,
        details: [
          detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_PROBLEM)),
          detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_FIX)),
        ],
      };
    case MARKETPLACE_INSTALL_VERDICT.UNREGISTERED:
      return {
        header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNREGISTERED,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNREGISTERED_MARKETPLACE_FIX))],
      };
    case MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE:
      return {
        header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED,
        details: [DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED],
      };
    case MARKETPLACE_INSTALL_VERDICT.UNKNOWN:
      return {
        header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNKNOWN,
        details: [detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNKNOWN_RETRY))],
      };
    default:
      return fallbackText(check);
  }
}

function fallbackText(_check: CheckRecord): DiagnoseHumanText {
  return {
    header: DIAGNOSE_TEXT_HEADER.RENDERING_UNAVAILABLE,
    details: [
      detail(DIAGNOSE_TEXT_LABEL.PROBLEM, authoredText(DIAGNOSE_TEXT_DETAIL.RENDERING_UNAVAILABLE)),
      detail(DIAGNOSE_TEXT_LABEL.FIX, authoredText(DIAGNOSE_TEXT_DETAIL.UNKNOWN_RETRY)),
    ],
  };
}

function humanText(check: CheckRecord): DiagnoseHumanText {
  switch (check.name) {
    case CHECK_NAME.SPX_REACHABILITY:
      return spxReachabilityText(check);
    case CHECK_NAME.SESSION_ENVIRONMENT:
      return sessionEnvironmentText(check);
    case CHECK_NAME.WORKTREE_POOL:
      return worktreePoolText(check);
    case CHECK_NAME.SESSION_STORE:
      return sessionStoreText(check);
    case CHECK_NAME.MARKETPLACE_INSTALL:
      return marketplaceInstallText(check);
    case CHECK_NAME.METHODOLOGY_CONTEXT:
      return methodologyContextText(check);
    default:
      return fallbackText(check);
  }
}

/** Projects the report onto the styled-output model: one diagnosis section per check, the overall as the summary. */
function toStyledModel(report: DiagnoseReport): StyledReportModel {
  return {
    sections: report.checks.map((check) => {
      const text = humanText(check);
      return {
        severity: BUCKET_SEVERITY[check.bucket],
        header: text.header,
        details: text.details,
      };
    }),
    summary: {
      severity: OVERALL_SEVERITY[report.overall],
      text: `${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`,
    },
  };
}

/** Renders the report as human-readable diagnosis text through the styled-output primitive. */
export function renderReportText(report: DiagnoseReport, options: StyledReportOptions): string {
  return renderStyledReport(toStyledModel(report), options);
}

/** Renders the report in the requested format; the color choice applies to the text form only. */
export function renderReport(
  report: DiagnoseReport,
  format: DiagnoseFormat,
  options: StyledReportOptions,
): string {
  return format === DIAGNOSE_FORMAT.JSON ? renderReportJson(report) : renderReportText(report, options);
}
