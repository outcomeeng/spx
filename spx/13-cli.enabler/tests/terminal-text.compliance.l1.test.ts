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

  it("refuses already-composed text in its optional shape, so an unnarrowed field cannot slip past", () => {
    // The draw is widened to the optional type by the mapper's declared return type; annotating
    // an assigned value instead would let the compiler narrow it back to the composed type.
    const maybeComposed = sampleGeneratedValue(
      arbitraryTerminalUnsafeText().map((text): TerminalText | undefined => authoredText(text)),
    );
    expectTypeOf(externalValue(maybeComposed)).not.toEqualTypeOf<TerminalText>();
  });

  it("refuses a union of composed text with a plain string, since such a value may already carry its decision", () => {
    const maybeComposed = sampleGeneratedValue(
      arbitraryTerminalUnsafeText().map((text): TerminalText | string => authoredText(text)),
    );
    expectTypeOf(externalValue(maybeComposed)).not.toEqualTypeOf<TerminalText>();
  });

  it("admits a caught error typed unknown, since its provenance is decided here", () => {
    const caught = sampleGeneratedValue(arbitraryTerminalUnsafeText().map((text): unknown => text));
    expectTypeOf(externalValue(caught)).toEqualTypeOf<TerminalText>();
  });

  it("accepts a plain value in its optional shape, so the refusal reaches only composed text", () => {
    const maybePlain = sampleGeneratedValue(arbitraryTerminalUnsafeText().map((text): string | undefined => text));
    expectTypeOf(externalValue(maybePlain)).toEqualTypeOf<TerminalText>();
  });

  it("accepts the same text once it has left the type's protection", () => {
    const composed = authoredText(sampleGeneratedValue(arbitraryTerminalUnsafeText()));
    expectTypeOf(externalValue(renderTerminalText(composed))).toEqualTypeOf<TerminalText>();
  });
});
