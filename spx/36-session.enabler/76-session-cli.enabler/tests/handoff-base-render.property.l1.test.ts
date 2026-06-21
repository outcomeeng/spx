import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  HANDOFF_BASE_FACT_LABEL,
  HANDOFF_BASE_MARK,
  HANDOFF_BASE_REMEDY,
  HANDOFF_BASE_UNRESOLVED,
  type HandoffBaseChecklist,
  renderHandoffBaseChecklist,
  SESSION_HANDOFF_BASE_ERROR_NAME,
} from "@/domains/session/handoff-base-checklist";
import { arbitraryHandoffBaseChecklist } from "@testing/generators/session/handoff-base";

/**
 * The literal placeholder the diagnostic must never render in place of an absent
 * ref — an unresolved value is the {@link HANDOFF_BASE_UNRESOLVED} sentinel, never
 * a fabricated `origin/<default>`. Owned by this contract, not a domain value.
 */
const FORBIDDEN_ORIGIN_PLACEHOLDER = "origin/<default>";

/**
 * The work-hiding remedy the refusal must never suggest — a refused base directs
 * the agent to commit, detach, or hand off from the main checkout, never to stash.
 */
const FORBIDDEN_STASH_REMEDY = "git stash";

/** The header line, then the five resolved-fact lines, before any prerequisite lines. */
const HEADER_LINE_COUNT = 1;
const FACT_LINE_COUNT = 5;
const FACT_LABEL_VALUE_SEPARATOR = ": ";

/** The five fact lines the renderer emits, in order, paired with the checklist field each carries. */
function expectedFacts(checklist: HandoffBaseChecklist): ReadonlyArray<readonly [string, string | null]> {
  return [
    [HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH, checklist.defaultBranch],
    [HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP, checklist.defaultTipSha],
    [HANDOFF_BASE_FACT_LABEL.HEAD, checklist.headSha],
    [HANDOFF_BASE_FACT_LABEL.CURRENT_WORKTREE, checklist.currentWorktreePath],
    [HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT, checklist.mainCheckoutPath],
  ];
}

/** Splits a rendered fact line into its label and value at the first label-value separator. */
function parseFactLine(line: string): { readonly label: string; readonly value: string } {
  const trimmed = line.trimStart();
  const separator = trimmed.indexOf(FACT_LABEL_VALUE_SEPARATOR);
  return {
    label: trimmed.slice(0, separator),
    value: trimmed.slice(separator + FACT_LABEL_VALUE_SEPARATOR.length),
  };
}

describe("renderHandoffBaseChecklist", () => {
  it("renders the header, five fact lines, and one line per prerequisite", () => {
    fc.assert(
      fc.property(arbitraryHandoffBaseChecklist(), (checklist) => {
        const lines = renderHandoffBaseChecklist(checklist).split("\n");

        expect(lines).toHaveLength(HEADER_LINE_COUNT + FACT_LINE_COUNT + checklist.prerequisites.length);
        expect(lines[0]).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      }),
    );
  });

  it("round-trips every resolved fact, rendering an absent value as the unresolved sentinel", () => {
    fc.assert(
      fc.property(arbitraryHandoffBaseChecklist(), (checklist) => {
        const lines = renderHandoffBaseChecklist(checklist).split("\n");
        const facts = expectedFacts(checklist);

        facts.forEach(([label, field], index) => {
          const parsed = parseFactLine(lines[HEADER_LINE_COUNT + index]);
          expect(parsed.label).toBe(label);
          expect(parsed.value).toBe(field ?? HANDOFF_BASE_UNRESOLVED);
        });
      }),
    );
  });

  it("never fabricates the origin/<default> placeholder for an unresolved value", () => {
    // The generator draws each fact as null or a real value, so the renderer can only map an
    // absent fact to the unresolved sentinel. The property therefore guards the renderer's own
    // formatting from emitting the literal placeholder, not an arbitrary-input injection boundary.
    fc.assert(
      fc.property(arbitraryHandoffBaseChecklist(), (checklist) => {
        expect(renderHandoffBaseChecklist(checklist)).not.toContain(FORBIDDEN_ORIGIN_PLACEHOLDER);
      }),
    );
  });

  it("never suggests a stashing remedy", () => {
    // Two-part proof. The loop proves the closed remedy set the resolver assigns carries no
    // work-hiding remedy. The property then proves the renderer's own formatting — header, fact
    // labels, prerequisite marks — injects no stash string for any checklist shape; because the
    // generator draws remedies only from that closed set, the property guards the renderer's
    // static text rather than an arbitrary-remedy round-trip.
    for (const remedy of Object.values(HANDOFF_BASE_REMEDY)) {
      expect(remedy).not.toContain(FORBIDDEN_STASH_REMEDY);
    }
    fc.assert(
      fc.property(arbitraryHandoffBaseChecklist(), (checklist) => {
        expect(renderHandoffBaseChecklist(checklist)).not.toContain(FORBIDDEN_STASH_REMEDY);
      }),
    );
  });

  it("marks each prerequisite met without a remedy, or unmet with its remedy", () => {
    fc.assert(
      fc.property(arbitraryHandoffBaseChecklist(), (checklist) => {
        const lines = renderHandoffBaseChecklist(checklist).split("\n");
        const prerequisiteOffset = HEADER_LINE_COUNT + FACT_LINE_COUNT;

        checklist.prerequisites.forEach((prerequisite, index) => {
          const line = lines[prerequisiteOffset + index].trimStart();
          expect(line).toContain(prerequisite.label);
          if (prerequisite.met) {
            expect(line.startsWith(HANDOFF_BASE_MARK.MET)).toBe(true);
          } else {
            expect(line.startsWith(HANDOFF_BASE_MARK.UNMET)).toBe(true);
            expect(line).toContain(prerequisite.remedy);
          }
        });
      }),
    );
  });
});
