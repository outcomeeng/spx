/**
 * The contract every agent module satisfies: the facts spx needs about one coding agent, declared
 * once in that agent's module under `agents/` and listed by the agent registry.
 *
 * @module lib/agent-environment/agent-module
 */

import type { MethodologyCodingAgent } from "@/lib/methodology";

/** A command an agent ships: its executable and the arguments that make it print JSON. */
export interface AgentCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

/** How a listing command's JSON output holds its entries. */
export const AGENT_LISTING_CONTAINER = {
  /** The output is an array of entries. */
  ARRAY: "array",
  /** The output is an object whose named property holds the array of entries. */
  PROPERTY: "property",
} as const;

export type AgentListingContainer = (typeof AGENT_LISTING_CONTAINER)[keyof typeof AGENT_LISTING_CONTAINER];

/** A plugin or marketplace listing: the command, where its entries sit, and the fields each entry carries. */
export interface AgentListing {
  readonly command: AgentCommand;
  readonly container: AgentListingContainer;
  /** The property that holds the entries when the container is a property. */
  readonly property?: string;
  /** The fields each entry carries, a nested field written as its dotted path. */
  readonly entryFields: readonly string[];
}

/** The directory an agent's configuration lives in. */
export interface AgentHome {
  /** The variable that names the agent home. */
  readonly variable: string;
  /** The directory in the person's home directory that is user scope when the variable is unset. */
  readonly userScopeDirectory: string;
}

/** User scope spx reads for diagnostics only, for an agent that has no variable to redirect it. */
export interface AgentUserScope {
  /** The configuration home, relative to the person's home directory. */
  readonly configurationDirectory: string;
  /** The plugin directory, relative to the person's home directory. */
  readonly pluginDirectory: string;
}

/** Where an agent records the working directory and branch of a transcript. */
export const AGENT_TRANSCRIPT_LOCATION = {
  /** The transcript lives in a project directory whose name encodes the working directory. */
  PROJECT_DIRECTORY: "project-directory",
  /** The transcript's opening row records the working directory. */
  OPENING_ROW: "opening-row",
} as const;

export type AgentTranscriptLocation = (typeof AGENT_TRANSCRIPT_LOCATION)[keyof typeof AGENT_TRANSCRIPT_LOCATION];

/** Which rows of a transcript carry the branch. */
export const AGENT_TRANSCRIPT_BRANCH_ROWS = {
  EVERY_ROW: "every-row",
  OPENING_ROW: "opening-row",
} as const;

export type AgentTranscriptBranchRows =
  (typeof AGENT_TRANSCRIPT_BRANCH_ROWS)[keyof typeof AGENT_TRANSCRIPT_BRANCH_ROWS];

/** How a record holds a working directory. */
export const AGENT_WORKING_DIRECTORY_FORM = {
  PATH: "path",
  FILE_URI: "file-uri",
} as const;

export type AgentWorkingDirectoryForm =
  (typeof AGENT_WORKING_DIRECTORY_FORM)[keyof typeof AGENT_WORKING_DIRECTORY_FORM];

/** A transcript record type the agent's record reader accepts as carrying a working directory. */
export interface AgentWorkingDirectoryRecord {
  readonly recordType: string;
  readonly form: AgentWorkingDirectoryForm;
  /** The field that holds the working directory, as a dotted path, when the record names one. */
  readonly field?: string;
}

/** An agent's session store and the records its transcripts hold. */
export interface AgentSessionStore {
  /** The store directory inside the agent home, or inside its user scope. */
  readonly directory: string;
  readonly transcriptExtension: string;
  readonly transcriptLocation: AgentTranscriptLocation;
  readonly branchRows: AgentTranscriptBranchRows;
  /** The opening row type that records the working directory and branch, when the transcript has one. */
  readonly openingRowType?: string;
  readonly workingDirectoryRecords: readonly AgentWorkingDirectoryRecord[];
}

/** The facts spx needs about one coding agent. */
export interface AgentModule {
  /** The agent id configuration references. */
  readonly id: string;
  /** The one variable whose non-empty value identifies this agent and holds its session id. */
  readonly identityVariable: string;
  /** The default of `hooks.sessionStart.compactStdout` for this agent. */
  readonly compactStdoutDefault: boolean;
  /** The methodology bundle this agent receives, when it receives one. */
  readonly methodologyBundle?: MethodologyCodingAgent;
  /** Whether this agent's methodology bundle is the default methodology bundle. */
  readonly defaultMethodologyBundle: boolean;
  /** The agent home spx works in, when spx sets one for this agent. */
  readonly home?: AgentHome;
  /** User scope spx reads for diagnostics only, for an agent spx sets no home for. */
  readonly userScope?: AgentUserScope;
  /** The session store spx reads, when the agent has one. */
  readonly sessionStore?: AgentSessionStore;
  /** The name of the agent's process. */
  readonly processName: string;
  readonly pluginListing: AgentListing;
  /** The marketplace listing, when the agent has one. */
  readonly marketplaceListing?: AgentListing;
  /** Whether agent configuration installs marketplaces, plugins, and skills for this agent. */
  readonly installs: boolean;
}
