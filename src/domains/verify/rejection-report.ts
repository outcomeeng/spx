/**
 * The human-facing rendering of an evidence-payload rejection.
 *
 * A producer that sent a malformed payload reads this block on standard error. It answers the
 * three questions a rejection raises — which validator refused, what it refused, and whether the
 * run survived — as labeled lines rather than one dense sentence, so the reason is findable at a
 * glance and the retry is unambiguous.
 *
 * Composition runs through the terminal-text primitive, so the trust decision sits where each
 * value is embedded: the labels and the reason are product-authored and keep their bytes, while
 * the verification type arrives from the caller's own argv and is escaped. Escaping at the write
 * site cannot draw that line, because by then the block is one composite string.
 *
 * @module domains/verify/rejection-report
 */

import { authoredText, renderTerminalText, terminal, type TerminalText } from "@/lib/terminal-text/terminal-text";

export const VERIFY_REJECTION_TEXT = {
  VERIFICATION_TYPE_LABEL: "verification type",
  EVIDENCE_KIND_LABEL: "evidence kind",
  REASON_LABEL: "reason",
  APPEND_RETRY_NOTE: "the run is unchanged; fix the payload and retry with the same idempotency key",
  FINISH_RETRY_NOTE: "the run is unchanged and unsealed; fix the terminal completion and retry",
} as const;

const REJECTION_LINE_SEPARATOR = "\n";
const REJECTION_BLANK_LINE = "";
const REJECTION_INDENT = "  ";
const LABEL_GAP = "  ";
const LABEL_PAD_CHARACTER = " ";

/** The widest label, so every reading starts in the same column. */
const LABEL_WIDTH = Math.max(
  VERIFY_REJECTION_TEXT.VERIFICATION_TYPE_LABEL.length,
  VERIFY_REJECTION_TEXT.EVIDENCE_KIND_LABEL.length,
  VERIFY_REJECTION_TEXT.REASON_LABEL.length,
);

/** One rejected evidence append, as the producer that sent the payload needs to read it. */
export interface VerifyRejectionReport {
  /** The command path and the refusal, product-authored by the command layer. */
  readonly headline: string;
  /** The verification type the caller named on the command line. */
  readonly verificationType: string;
  /** The evidence kind the verb records — product-owned vocabulary. */
  readonly evidenceKind: string;
  /** The validator's reason: the failing payload field path or the unmet structural requirement. */
  readonly reason: string;
  /** What survived the refusal and how to retry it, product-authored per verb. */
  readonly note: string;
}

function labelledLine(label: string, value: TerminalText): TerminalText {
  const padded = label.padEnd(LABEL_WIDTH, LABEL_PAD_CHARACTER);
  return terminal`${authoredText(REJECTION_INDENT)}${authoredText(padded)}${authoredText(LABEL_GAP)}${value}`;
}

/**
 * Render a rejection for standard error. The verification type is escaped as an external segment;
 * every other segment is product-authored, so the block's alignment and line structure survive.
 */
export function renderVerifyRejection(report: VerifyRejectionReport): string {
  const lines: readonly TerminalText[] = [
    terminal`${authoredText(report.headline)}`,
    authoredText(REJECTION_BLANK_LINE),
    labelledLine(VERIFY_REJECTION_TEXT.VERIFICATION_TYPE_LABEL, terminal`${report.verificationType}`),
    labelledLine(VERIFY_REJECTION_TEXT.EVIDENCE_KIND_LABEL, authoredText(report.evidenceKind)),
    labelledLine(VERIFY_REJECTION_TEXT.REASON_LABEL, authoredText(report.reason)),
    authoredText(REJECTION_BLANK_LINE),
    terminal`${authoredText(REJECTION_INDENT)}${authoredText(report.note)}`,
  ];
  return lines.map((line) => renderTerminalText(line)).join(REJECTION_LINE_SEPARATOR);
}
