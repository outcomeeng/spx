import { describe, expectTypeOf, it } from "vitest";

import {
  authoredText,
  externalValue,
  joinTerminalText,
  renderTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryTerminalUnsafeText } from "@testing/generators/terminal-text/terminal-text";

// The brand is erased at runtime, so the rule holds at the type level and the
// type-check gate is what fails when composed text is admitted as an external value.
describe("terminal text external-value boundary", () => {
  it("refuses already-composed text at the external-value decision", () => {
    const composed = authoredText(sampleGeneratedValue(arbitraryTerminalUnsafeText()));
    expectTypeOf(externalValue(composed)).not.toEqualTypeOf<TerminalText>();
  });

  it("admits the refused value in no composition, so re-escaping composed text fails to compile", () => {
    const refused = externalValue(authoredText(sampleGeneratedValue(arbitraryTerminalUnsafeText())));
    expectTypeOf(refused).not.toMatchTypeOf<Parameters<typeof terminal>[1]>();
    expectTypeOf(refused).not.toMatchTypeOf<Parameters<typeof joinTerminalText>[0]>();
  });

  it("accepts the same text once it has left the type's protection", () => {
    const composed = authoredText(sampleGeneratedValue(arbitraryTerminalUnsafeText()));
    expectTypeOf(externalValue(renderTerminalText(composed))).toEqualTypeOf<TerminalText>();
  });
});
