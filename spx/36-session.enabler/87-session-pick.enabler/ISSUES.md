# Open Issues

## Row width is measured in code units, not terminal display columns

`truncateToWidth` and the row-width reserve in `SessionPicker` count JavaScript string length (UTF-16 code units), while a terminal lays out by display columns. For goals containing wide or astral characters — CJK text, emoji — or the ambiguous-width glyphs the picker itself renders (`❯`, the `…` ellipsis), a row can therefore over- or under-fill its column budget by one or more columns, and a truncation point can fall between the two code units of a surrogate pair and emit a replacement glyph.

**Evidence:** `src/domains/session/pick-model.ts` `truncateToWidth` slices on `.length`; `src/interfaces/cli/session/pick/SessionPicker.tsx` computes `reserved` from `marker.length + id.length + badge.length`. Both are code-unit counts. The outer `wrap="truncate"` caps the rendered line at the terminal width, so a row never wraps to a second line, but the truncation boundary and the reserved budget are not display-column-accurate.

**Impact:** ASCII goals (the common case) render correctly. The defect is visible only for non-ASCII goal text, and the single-row guarantee still holds because Ink's truncate is the backstop. Both the PR reviewer and the Codex reviewer flagged this as a wider change rather than a PR-scoped fix.

**Resolution:** Introduce a display-width-aware helper (a grapheme segmenter plus an East-Asian-width table, or an injected `charWidth` function) and route `truncateToWidth` and the row reserve through it. This is a cross-cutting capability the future non-interactive `session list` uplift (see `spx/36-session.enabler/76-session-cli.enabler/PLAN.md`) would share, so it belongs in a dedicated change rather than the picker node alone.
