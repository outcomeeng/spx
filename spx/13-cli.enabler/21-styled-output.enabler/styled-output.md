# Styled Output

PROVIDES a shared, non-interactive styled-output primitive — a pure formatter that renders a report from section headers, severity-keyed status glyphs, tree-indented detail lines, and a severity-colored summary line, with ANSI styling gated by a color boolean
SO THAT `spx diagnose` and other spx commands that emit a human-readable report to a non-interactive terminal
CAN render `/doctor`-grade styled output from a pure function whose content is identical across styled and plain renders, with the color decision resolved once at the descriptor boundary

## Assertions

### Mappings

- Each severity maps to its fixed glyph and color — ok to green `✓`, warn to yellow `⚠`, error to red `✗`, unknown to red `?`, muted to dim `○` ([test](tests/severity-styling.mapping.l1.test.ts))
- The color choice resolves by precedence — an explicit `--color`/`--no-color` flag wins, else a non-empty `NO_COLOR` disables color, else the output stream's TTY status decides ([test](tests/color-choice.mapping.l1.test.ts))

### Scenarios

- Given a report with a section header, detail lines, and a summary, when rendered with color enabled, then the header is bold, detail lines are dim and tree-indented with `├` and `└`, and the summary line is bold and colored by its severity ([test](tests/styled-output.scenario.l1.test.ts))

### Properties

- Content parity: for every report, the ANSI-stripped styled render equals the color-disabled render — styling adds only ANSI, never content ([test](tests/content-parity.property.l1.test.ts))
- No-color purity: for every report rendered with color disabled, the output contains no ANSI escape sequence ([test](tests/content-parity.property.l1.test.ts))
- Determinism: for the same report and color boolean, the formatter returns identical output ([test](tests/styled-output.property.l1.test.ts))

### Compliance

- ALWAYS: the pure styling utility lives under `src/lib/` and accepts a color boolean, building a chalk instance at a fixed level — 1 when color is enabled, 0 when disabled — per `spx/13-cli.enabler/15-cli-architecture.adr.md` ([audit])
- ALWAYS: the color decision resolves at the descriptor boundary from TTY detection, `NO_COLOR`, and `--color`/`--no-color`, and is passed as a boolean to the pure formatter, which performs no TTY or environment probing ([audit])
- NEVER: the styled-output primitive renders an interactive interface or imports Ink, React, or a terminal-control API — interactive rendering is governed by `spx/13-cli.enabler/21-terminal-ui.adr.md` ([audit])
