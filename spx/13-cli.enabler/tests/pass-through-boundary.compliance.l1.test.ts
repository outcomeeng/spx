import { describe, expect, it } from "vitest";

import { arbitraryTerminalUnsafeText, TERMINAL_ORACLE } from "@testing/generators/terminal-text/terminal-text";
import { OUTPUT_CHANNEL_VERB, runOutputChannelVerb } from "@testing/harnesses/cli/output-channels";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the two channels of each standard stream", () => {
  it("relays a document byte-for-byte while composing the same bytes escapes them", async () => {
    await assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      const { composed: relayed } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.RELAY);
      const { composed } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.COMPOSE);

      expect(relayed).toBe(payload);
      // The bounds are the escaper's own published contract, so the expectation does not rerun
      // the escaper: whatever it turned each unsafe byte into, none may remain in the output.
      for (const char of composed) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(char.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
      // The generator guarantees at least one terminal-unsafe byte, so escaping must have
      // changed the payload; an identity escaper would relay and compose the same bytes.
      expect(composed).not.toBe(relayed);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("sends relayed output to the destination a caller set for composed output", async () => {
    await assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      // Only the composed-text write is redirected. Both channels write one stream, so the
      // relayed document has to arrive in the composed buffer rather than the real standard output.
      const { composed } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.RELAY);

      expect(composed).toBe(payload);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("sends relayed output to a separately redirected relay instead of the composed destination", async () => {
    await assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      // This is the "unless it redirects the relay separately" carve-out. A caller that sets both
      // destinations gets them honoured independently, so the relay must not fall back to the
      // composed destination once it has one of its own.
      const { composed, relayed } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.RELAY, {
        splitRelay: true,
      });

      expect(relayed).toBe(payload);
      expect(composed).toHaveLength(0);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("relays a document byte-for-byte on standard error while composing the same bytes there escapes them", async () => {
    await assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      const { composedError: relayed } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.RELAY_ERROR);
      const { composedError: composed } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.COMPOSE_ERROR);

      expect(relayed).toBe(payload);
      for (const char of composed) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(char.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
      expect(composed).not.toBe(relayed);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("sends a standard-error relay to the destination a caller set for composed standard error", async () => {
    await assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      const { composedError } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.RELAY_ERROR);

      expect(composedError).toBe(payload);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("sends a standard-error relay to a separately redirected relay instead of the composed standard-error destination", async () => {
    await assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      const { composedError, relayedError } = await runOutputChannelVerb(payload, OUTPUT_CHANNEL_VERB.RELAY_ERROR, {
        splitRelay: true,
      });

      expect(relayedError).toBe(payload);
      expect(composedError).toHaveLength(0);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
