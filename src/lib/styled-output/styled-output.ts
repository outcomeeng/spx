/**
 * Non-interactive styled-output primitive — a pure formatter that renders a
 * report from section headers, severity-keyed status glyphs, tree-indented
 * detail lines, and a severity-colored summary line. ANSI styling is gated by a
 * color boolean the caller resolves at the descriptor boundary; the formatter
 * performs no TTY or environment probing. Distinct from the interactive Ink
 * runtime — this primitive renders plain styled text for piping and CI.
 *
 * @module lib/styled-output/styled-output
 */

import { Chalk } from "chalk";

/** The severity vocabulary a styled report keys its glyphs and colors on. */
export const SEVERITY = {
  OK: "ok",
  WARN: "warn",
  ERROR: "error",
  UNKNOWN: "unknown",
  MUTED: "muted",
} as const;

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY];

/** The chalk method names this primitive styles glyphs and summaries with. */
const STYLE_NAME = {
  GREEN: "green",
  YELLOW: "yellow",
  RED: "red",
  DIM: "dim",
} as const;

export type StyleName = (typeof STYLE_NAME)[keyof typeof STYLE_NAME];

/** The chalk method each severity styles its glyph and summary with. */
export interface SeverityGlyphStyle {
  /** The status glyph rendered for the severity. */
  readonly glyph: string;
  /** The chalk method name applied to the glyph and the severity-colored summary. */
  readonly style: StyleName;
}

/** The fixed severity→glyph+color convention shared across commands. */
export const SEVERITY_STYLE: Readonly<Record<Severity, SeverityGlyphStyle>> = {
  [SEVERITY.OK]: { glyph: "✓", style: STYLE_NAME.GREEN },
  [SEVERITY.WARN]: { glyph: "⚠", style: STYLE_NAME.YELLOW },
  [SEVERITY.ERROR]: { glyph: "✗", style: STYLE_NAME.RED },
  [SEVERITY.UNKNOWN]: { glyph: "?", style: STYLE_NAME.RED },
  [SEVERITY.MUTED]: { glyph: "○", style: STYLE_NAME.DIM },
} as const;

/** The tree-branch glyph for a non-final detail line. */
export const DETAIL_TEE = "├";
/** The tree-branch glyph for the final detail line. */
export const DETAIL_ELBOW = "└";
/** The indent that precedes every detail line. */
export const DETAIL_INDENT = "  ";

/** One section of a styled report: a severity-keyed header with tree-indented detail lines. */
export interface StyledSection {
  /** The severity that keys the section's status glyph and color. */
  readonly severity: Severity;
  /** The bold section header text. */
  readonly header: string;
  /** The dim, tree-indented detail lines under the header. */
  readonly details: readonly string[];
}

/** The severity-colored, bold summary line that closes a styled report. */
export interface StyledSummary {
  /** The severity that colors the summary line. */
  readonly severity: Severity;
  /** The summary line text. */
  readonly text: string;
}

/** A styled report: a list of sections plus a closing summary line. */
export interface StyledReportModel {
  readonly sections: readonly StyledSection[];
  readonly summary: StyledSummary;
}

/** Whether the rendered report carries ANSI styling. */
export interface StyledReportOptions {
  readonly color: boolean;
}

/** One section in a plain grouped tree: a header plus indented child lines. */
export interface PlainTreeSection {
  readonly header: string;
  readonly children: readonly string[];
}

/** A plain grouped tree, used by non-severity command output. */
export interface PlainTreeModel {
  readonly sections: readonly PlainTreeSection[];
}

/**
 * Renders the report model to text. With `color: false` the output is identical
 * content with no ANSI; with `color: true` the same content carries ANSI, so the
 * ANSI-stripped colored render equals the plain render.
 */
export function renderStyledReport(model: StyledReportModel, options: StyledReportOptions): string {
  const chalk = new Chalk({ level: options.color ? 1 : 0 });
  const lines: string[] = [];
  for (const section of model.sections) {
    const { glyph, style } = SEVERITY_STYLE[section.severity];
    lines.push(`${chalk[style](glyph)} ${chalk.bold(section.header)}`);
    const lastIndex = section.details.length - 1;
    section.details.forEach((detail, index) => {
      const branch = index === lastIndex ? DETAIL_ELBOW : DETAIL_TEE;
      const detailText = `${branch} ${detail}`;
      lines.push(`${DETAIL_INDENT}${chalk.dim(detailText)}`);
    });
  }
  const summaryStyle = SEVERITY_STYLE[model.summary.severity].style;
  lines.push(chalk.bold(chalk[summaryStyle](model.summary.text)));
  return lines.join("\n");
}

/** Renders a plain grouped tree with each section header followed by indented children. */
export function renderPlainTree(model: PlainTreeModel): string {
  return model.sections
    .flatMap((section) => [
      `${section.header}:`,
      ...section.children.map((child) => `${DETAIL_INDENT}${child}`),
    ])
    .join("\n");
}

/** The inputs the descriptor boundary reads to resolve the color choice. */
export interface ColorChoice {
  /** An explicit `--color` (true) or `--no-color` (false) flag, or undefined when neither is passed. */
  readonly flag?: boolean;
  /** The `NO_COLOR` environment value, if set. */
  readonly noColor?: string;
  /** Whether the output stream is a TTY. */
  readonly isTty: boolean;
}

/**
 * Resolves whether to emit color by precedence: an explicit flag wins, else a
 * non-empty `NO_COLOR` disables color, else the stream's TTY status decides.
 * Pure: the descriptor reads the flag, environment, and TTY status and passes
 * them here.
 */
export function resolveColorChoice(choice: ColorChoice): boolean {
  if (choice.flag !== undefined) return choice.flag;
  if (choice.noColor !== undefined && choice.noColor !== "") return false;
  return choice.isTty;
}
