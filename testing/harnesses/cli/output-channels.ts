import type { Domain } from "@/interfaces/cli/domain";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

/** The two verbs of the channel domain, one per standard-output channel. */
export const OUTPUT_CHANNEL_VERB = {
  /** Relays the payload as a foreign document through the pass-through channel. */
  RELAY: "relay",
  /** States the payload as composed spx output through the composed-text write. */
  COMPOSE: "compose",
} as const;

export type OutputChannelVerb = (typeof OUTPUT_CHANNEL_VERB)[keyof typeof OUTPUT_CHANNEL_VERB];

/** Everything each channel wrote while one verb ran. */
export interface OutputChannelRun {
  /** What reached the composed-text destination. */
  readonly composed: string;
  /** What reached the relay destination, or the composed destination when the relay was not redirected. */
  readonly relayed: string;
}

export interface OutputChannelOptions {
  /**
   * Redirect the relay to its own buffer. Left off, only the composed-text write is redirected,
   * so a relayed document lands in the composed buffer through the one-stream fallback.
   */
  readonly splitRelay?: boolean;
}

/**
 * A domain whose two verbs differ only in the channel they select: one relays the payload as a
 * foreign document, the other states it as composed spx output. Both write the same bytes, so the
 * channel is the only thing a caller's assertions can be reading.
 */
function channelDomain(payload: string): Domain {
  return {
    name: "channel",
    description: "Exercises the two standard-output channels",
    register: (program, invocation) => {
      program
        .command(OUTPUT_CHANNEL_VERB.RELAY)
        .action(() => {
          invocation.io.writePassThrough(payload);
        });
      program
        .command(OUTPUT_CHANNEL_VERB.COMPOSE)
        .action(() => {
          invocation.io.writeStdout(renderTerminalText(terminal`${externalValue(payload)}`));
        });
    },
  };
}

/** Runs one verb of the channel domain through the real CLI program and returns what each channel wrote. */
export async function runOutputChannelVerb(
  payload: string,
  verb: OutputChannelVerb,
  options: OutputChannelOptions = {},
): Promise<OutputChannelRun> {
  const composed: string[] = [];
  const relayed: string[] = [];
  const program = createCliProgram({
    domains: [channelDomain(payload)],
    writeStdout: (output) => composed.push(output),
    ...(options.splitRelay === true ? { writePassThrough: (output: string) => relayed.push(output) } : {}),
  });
  await program.parseAsync([verb], { from: SPX_COMMANDER_PARSE_SOURCE });
  return { composed: composed.join(""), relayed: relayed.join("") };
}
