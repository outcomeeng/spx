import type { Domain } from "@/interfaces/cli/domain";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

/** The four verbs of the channel domain, one per channel on each standard stream. */
export const OUTPUT_CHANNEL_VERB = {
  /** Relays the payload as a foreign document through the standard-output pass-through channel. */
  RELAY: "relay",
  /** States the payload as composed spx output through the standard-output composed-text write. */
  COMPOSE: "compose",
  /** Relays the payload as a foreign document through the standard-error pass-through channel. */
  RELAY_ERROR: "relay-error",
  /** States the payload as composed spx output through the standard-error composed-text write. */
  COMPOSE_ERROR: "compose-error",
} as const;

export type OutputChannelVerb = (typeof OUTPUT_CHANNEL_VERB)[keyof typeof OUTPUT_CHANNEL_VERB];

/** Everything each channel wrote while one verb ran. */
export interface OutputChannelRun {
  /** What reached the standard-output composed-text destination. */
  readonly composed: string;
  /** What reached the standard-output relay destination, or the composed destination when the relay was not redirected. */
  readonly relayed: string;
  /** What reached the standard-error composed-text destination. */
  readonly composedError: string;
  /** What reached the standard-error relay destination, or the composed-error destination when the relay was not redirected. */
  readonly relayedError: string;
}

export interface OutputChannelOptions {
  /**
   * Redirect each stream's relay to its own buffer. Left off, only the composed-text writes are
   * redirected, so a relayed document lands in its stream's composed buffer through the
   * one-stream fallback.
   */
  readonly splitRelay?: boolean;
}

/**
 * A domain whose verbs differ only in the channel they select: on each standard stream, one
 * relays the payload as a foreign document and the other states it as composed spx output. All
 * four write the same bytes, so the channel is the only thing a caller's assertions can be reading.
 */
function channelDomain(payload: string): Domain {
  return {
    name: "channel",
    description: "Exercises the two channels of each standard stream",
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
      program
        .command(OUTPUT_CHANNEL_VERB.RELAY_ERROR)
        .action(() => {
          invocation.io.writePassThroughError(payload);
        });
      program
        .command(OUTPUT_CHANNEL_VERB.COMPOSE_ERROR)
        .action(() => {
          invocation.io.writeStderr(renderTerminalText(terminal`${externalValue(payload)}`));
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
  const composedError: string[] = [];
  const relayedError: string[] = [];
  const program = createCliProgram({
    domains: [channelDomain(payload)],
    writeStdout: (output) => composed.push(output),
    writeStderr: (output) => composedError.push(output),
    ...(options.splitRelay === true
      ? {
        writePassThrough: (output: string) => relayed.push(output),
        writePassThroughError: (output: string) => relayedError.push(output),
      }
      : {}),
  });
  await program.parseAsync([verb], { from: SPX_COMMANDER_PARSE_SOURCE });
  return {
    composed: composed.join(""),
    relayed: relayed.join(""),
    composedError: composedError.join(""),
    relayedError: relayedError.join(""),
  };
}
