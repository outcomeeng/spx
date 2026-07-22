/**
 * The `spx session` command surface as one semantic registry.
 *
 * The session descriptor builds Commander from this object and the session
 * tests invoke the CLI through it, so the command grammar lives in exactly one
 * place — the verbs a user types, the options they pass, and the operand each
 * verb takes — rather than as string literals duplicated across the descriptor
 * and every CLI test.
 *
 * @module interfaces/cli/session/definition
 */

/** A `spx session <verb>` subcommand: the verb, its positional operand, and help text. */
export interface SessionSubcommandDefinition {
  readonly commandName: string;
  /**
   * The Commander operand grammar appended after the verb, e.g. `<id...>` or
   * `[ids...]`; absent when the verb takes no positional operand.
   */
  readonly operand?: string;
  readonly description: string;
}

/** A `spx session …` option: the flag, its value placeholder, help text, and optional default. */
export interface SessionOptionDefinition {
  readonly flag: string;
  /**
   * The Commander value placeholder appended after the flag, e.g. `<path>`;
   * absent for boolean flags that take no value.
   */
  readonly placeholder?: string;
  readonly description: string;
  readonly defaultValue?: string;
}

/** The whole `spx session` surface: the domain, its verbs, and the options the verbs accept. */
export interface SessionCliDefinition {
  readonly domain: { readonly commandName: string; readonly description: string };
  readonly subcommands: {
    readonly list: SessionSubcommandDefinition;
    readonly pick: SessionSubcommandDefinition;
    readonly todo: SessionSubcommandDefinition;
    readonly show: SessionSubcommandDefinition;
    readonly pickup: SessionSubcommandDefinition;
    readonly reconcile: SessionSubcommandDefinition;
    readonly release: SessionSubcommandDefinition;
    readonly handoff: SessionSubcommandDefinition;
    readonly delete: SessionSubcommandDefinition;
    readonly prune: SessionSubcommandDefinition;
    readonly archive: SessionSubcommandDefinition;
  };
  readonly options: {
    readonly status: SessionOptionDefinition;
    readonly json: SessionOptionDefinition;
    readonly fields: SessionOptionDefinition;
    readonly color: SessionOptionDefinition;
    readonly noColor: SessionOptionDefinition;
    readonly sessionsDir: SessionOptionDefinition;
    readonly auto: SessionOptionDefinition;
    readonly noInject: SessionOptionDefinition;
    readonly keep: SessionOptionDefinition;
    readonly dryRun: SessionOptionDefinition;
  };
}

export interface SessionSubcommandOptionsDefinition {
  readonly subcommand: SessionSubcommandDefinition;
  readonly options: readonly SessionOptionDefinition[];
}

export const sessionCliDefinition: SessionCliDefinition = {
  domain: { commandName: "session", description: "Manage session workflow" },
  subcommands: {
    list: {
      commandName: "list",
      description: "List active sessions (doing + todo by default)",
    },
    pick: {
      commandName: "pick",
      description: "Interactively pick a session and launch claude or codex to resume it",
    },
    todo: {
      commandName: "todo",
      description: "List todo sessions",
    },
    show: {
      commandName: "show",
      operand: "<id...>",
      description: "Show session content",
    },
    pickup: {
      commandName: "pickup",
      operand: "[ids...]",
      description: "Claim one or more sessions (move from todo to doing)",
    },
    reconcile: {
      commandName: "reconcile",
      operand: "<id>",
      description: "Reconcile a session's recorded references against current repository state (JSON verdicts)",
    },
    release: {
      commandName: "release",
      operand: "[ids...]",
      description: "Release one or more sessions (move from doing to todo)",
    },
    handoff: {
      commandName: "handoff",
      description: "Create a handoff session (reads JSON header + body from stdin)",
    },
    delete: {
      commandName: "delete",
      operand: "<id...>",
      description: "Delete one or more sessions",
    },
    prune: {
      commandName: "prune",
      description: "Remove old todo sessions, keeping the most recent N",
    },
    archive: {
      commandName: "archive",
      operand: "<id...>",
      description: "Move one or more sessions to the archive directory",
    },
  },
  options: {
    status: {
      flag: "--status",
      placeholder: "<status>",
      description: "Filter by status (todo|doing|archive); defaults to doing + todo",
    },
    json: {
      flag: "--json",
      description: "Output as JSON",
    },
    fields: {
      flag: "--fields",
      placeholder: "<fields>",
      description: "Comma-separated fields to emit as JSON (implies --json)",
    },
    color: {
      flag: "--color",
      description: "Force colored text output",
    },
    noColor: {
      flag: "--no-color",
      description: "Disable colored text output",
    },
    sessionsDir: {
      flag: "--sessions-dir",
      placeholder: "<path>",
      description: "Custom sessions directory",
    },
    auto: {
      flag: "--auto",
      description: "Auto-select highest priority session",
    },
    noInject: {
      flag: "--no-inject",
      description: "Skip printing files listed in session specs/files metadata",
    },
    keep: {
      flag: "--keep",
      placeholder: "<count>",
      description: "Number of sessions to keep (default: 5)",
      defaultValue: "5",
    },
    dryRun: {
      flag: "--dry-run",
      description: "Show what would be deleted without deleting",
    },
  },
};

export const sessionSubcommandOptions = [
  {
    subcommand: sessionCliDefinition.subcommands.list,
    options: [
      sessionCliDefinition.options.status,
      sessionCliDefinition.options.json,
      sessionCliDefinition.options.fields,
      sessionCliDefinition.options.color,
      sessionCliDefinition.options.noColor,
      sessionCliDefinition.options.sessionsDir,
    ],
  },
  {
    subcommand: sessionCliDefinition.subcommands.pick,
    options: [sessionCliDefinition.options.sessionsDir],
  },
  {
    subcommand: sessionCliDefinition.subcommands.todo,
    options: [
      sessionCliDefinition.options.json,
      sessionCliDefinition.options.fields,
      sessionCliDefinition.options.color,
      sessionCliDefinition.options.noColor,
      sessionCliDefinition.options.sessionsDir,
    ],
  },
  {
    subcommand: sessionCliDefinition.subcommands.show,
    options: [sessionCliDefinition.options.json, sessionCliDefinition.options.sessionsDir],
  },
  {
    subcommand: sessionCliDefinition.subcommands.pickup,
    options: [
      sessionCliDefinition.options.auto,
      sessionCliDefinition.options.noInject,
      sessionCliDefinition.options.sessionsDir,
    ],
  },
  {
    subcommand: sessionCliDefinition.subcommands.reconcile,
    options: [sessionCliDefinition.options.sessionsDir],
  },
  {
    subcommand: sessionCliDefinition.subcommands.release,
    options: [sessionCliDefinition.options.sessionsDir],
  },
  {
    subcommand: sessionCliDefinition.subcommands.handoff,
    options: [sessionCliDefinition.options.sessionsDir],
  },
  {
    subcommand: sessionCliDefinition.subcommands.delete,
    options: [sessionCliDefinition.options.sessionsDir],
  },
  {
    subcommand: sessionCliDefinition.subcommands.prune,
    options: [
      sessionCliDefinition.options.keep,
      sessionCliDefinition.options.dryRun,
      sessionCliDefinition.options.sessionsDir,
    ],
  },
  {
    subcommand: sessionCliDefinition.subcommands.archive,
    options: [sessionCliDefinition.options.sessionsDir],
  },
] satisfies readonly SessionSubcommandOptionsDefinition[];

export function sessionOptionsForSubcommand(
  subcommand: SessionSubcommandDefinition,
): readonly SessionOptionDefinition[] {
  return sessionSubcommandOptions.find((entry) => entry.subcommand === subcommand)?.options ?? [];
}

/** The Commander command token for a subcommand: the verb followed by its operand grammar. */
export function sessionCommandToken(subcommand: SessionSubcommandDefinition): string {
  return subcommand.operand === undefined
    ? subcommand.commandName
    : `${subcommand.commandName} ${subcommand.operand}`;
}

/** The Commander option token for an option: the flag followed by its value placeholder. */
export function sessionOptionToken(option: SessionOptionDefinition): string {
  return option.placeholder === undefined ? option.flag : `${option.flag} ${option.placeholder}`;
}
