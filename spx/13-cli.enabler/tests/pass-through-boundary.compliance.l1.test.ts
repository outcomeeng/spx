import { describe, expect, it } from "vitest";

import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram, SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";
import { arbitraryTerminalUnsafeText } from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

const relayVerb = "relay";
const composeVerb = "compose";

/**
 * A domain whose two verbs differ only in the channel they select: one relays the payload as a
 * foreign document, the other states it as composed spx output. Both write the same bytes, so the
 * channel is the only thing the assertions can be reading.
 */
function channelDomain(payload: string): Domain {
  return {
    name: "channel",
    description: "Exercises the two standard-output channels",
    register: (program, invocation) => {
      program
        .command(relayVerb)
        .action(() => {
          invocation.io.writePassThrough(payload);
        });
      program
        .command(composeVerb)
        .action(() => {
          invocation.io.writeStdout(renderTerminalText(terminal`${externalValue(payload)}`));
        });
    },
  };
}

async function runVerb(payload: string, verb: string): Promise<string> {
  const captured: string[] = [];
  const program = createCliProgram({
    domains: [channelDomain(payload)],
    writeStdout: (output) => captured.push(output),
  });
  await program.parseAsync([verb], { from: SPX_COMMANDER_PARSE_SOURCE });
  return captured.join("");
}

describe("the two standard-output channels", () => {
  it("relays a document byte-for-byte while composing the same bytes escapes them", () => {
    assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      const relayed = await runVerb(payload, relayVerb);
      const composed = await runVerb(payload, composeVerb);

      expect(relayed).toBe(payload);
      expect(composed).toBe(renderTerminalText(externalValue(payload)));
      // The generator guarantees at least one terminal-unsafe byte, so escaping must have
      // changed the payload; without this the first assertion would hold against an identity
      // escaper and prove nothing about the channel.
      expect(composed).not.toBe(relayed);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("sends relayed output to the destination a caller set for composed output", () => {
    assertProperty(arbitraryTerminalUnsafeText(), async (payload) => {
      // Only the composed-text write is redirected. Both channels write one stream, so the
      // relayed document has to arrive in the same buffer rather than the real standard output.
      const relayed = await runVerb(payload, relayVerb);

      expect(relayed).toBe(payload);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
