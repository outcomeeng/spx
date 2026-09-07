import { writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { execaTranscriptLocatorRunner } from "@/commands/agent/search";
import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import { AGENT_SESSION_KIND, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  agentSearchQueryFromOptions,
  type AgentSearchQueryOptions,
  type AgentSearchResult,
  createRipgrepTranscriptLocator,
  searchAgentSessions,
  type TranscriptLocator,
  type TranscriptLocatorRunner,
} from "@/domains/agent/search";
import type { GeneratedInvalidNeedleCase, GeneratedLocatorStoreCase } from "@testing/generators/agent/locator";
import type { GeneratedMovingSessionScenario } from "@testing/generators/agent/search";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

import { MemoryAgentSessionFileSystem, writeClaudeMultiRecordTranscriptFile } from "./resume";

const LOCATOR_STORE_TEMP_PREFIX = "spx-agent-search-locator-";

export interface TranscriptLocatorCall {
  readonly roots: readonly string[];
  readonly needle: string;
}

/**
 * The in-memory locator: names the store's transcripts whose text contains the needle, by the
 * same contract the production locator declares, and records every call so evidence can bound
 * the search's reads to the paths this locator named.
 */
export class MemoryTranscriptLocator implements TranscriptLocator {
  private readonly callList: TranscriptLocatorCall[] = [];
  private readonly namedPathSet = new Set<string>();

  constructor(private readonly fs: MemoryAgentSessionFileSystem) {}

  async locate(roots: readonly string[], needle: string): Promise<readonly string[]> {
    this.callList.push({ roots: [...roots], needle });
    const resolvedRoots = roots.map((root) => resolve(root));
    const named = this.fs
      .entries()
      .filter(([path]) => path.endsWith(AGENT_SESSION_STORE.JSONL_EXTENSION))
      .filter(([path]) => resolvedRoots.some((root) => path === root || path.startsWith(`${root}${sep}`)))
      .filter(([, content]) => content.includes(needle))
      .map(([path]) => path);
    for (const path of named) {
      this.namedPathSet.add(path);
    }
    return named;
  }

  calls(): readonly TranscriptLocatorCall[] {
    return [...this.callList];
  }

  needles(): readonly string[] {
    return this.callList.map((call) => call.needle);
  }

  namedPaths(): readonly string[] {
    return [...this.namedPathSet];
  }
}

export interface RipgrepLocatorStoreObservation {
  readonly named: readonly string[];
  readonly hitPath: string;
  readonly missPath: string;
}

/** A two-file temporary store searched by the production ripgrep locator. */
export async function withRipgrepLocatorStore(
  storeCase: GeneratedLocatorStoreCase,
  callback: (observation: RipgrepLocatorStoreObservation) => void,
): Promise<void> {
  await withTempDir(LOCATOR_STORE_TEMP_PREFIX, async (dir) => {
    const hitPath = join(dir, storeCase.hitFileName);
    const missPath = join(dir, storeCase.missFileName);
    await writeFile(hitPath, storeCase.hitContent, AGENT_SESSION_STORE.TEXT_ENCODING);
    await writeFile(missPath, storeCase.missContent, AGENT_SESSION_STORE.TEXT_ENCODING);
    const named = await createRipgrepTranscriptLocator(execaTranscriptLocatorRunner).locate([dir], storeCase.needle);
    callback({ named: named.map((path) => resolve(path)), hitPath: resolve(hitPath), missPath: resolve(missPath) });
  });
}

/** A runner whose executable cannot be started: the failure-simulation exception at the process boundary. */
export function unstartableTranscriptLocatorRunner(): TranscriptLocatorRunner {
  return async () => ({ exitCode: null, stdout: new Uint8Array(), stderr: "" });
}

export interface LocatorSearchObservation {
  readonly results: readonly AgentSearchResult[];
  readonly error: unknown;
  readonly fs: MemoryAgentSessionFileSystem;
}

function movingSessionStore(scenario: GeneratedMovingSessionScenario): MemoryAgentSessionFileSystem {
  const fs = new MemoryAgentSessionFileSystem();
  writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
    sessionId: scenario.sessionId,
    records: scenario.records,
    modifiedAtMs: scenario.nowMs,
    marker: scenario.contentNeedle,
  });
  writeClaudeMultiRecordTranscriptFile(fs, scenario.homeDir, {
    sessionId: scenario.decoySessionId,
    records: scenario.decoyRecords,
    modifiedAtMs: scenario.nowMs,
  });
  return fs;
}

async function observeSearch(
  scenario: GeneratedMovingSessionScenario,
  fs: MemoryAgentSessionFileSystem,
  locator: TranscriptLocator,
  query: AgentSearchQueryOptions,
): Promise<LocatorSearchObservation> {
  try {
    const results = await searchAgentSessions({
      agentHomeDirs: agentHomeDirsFromHomeDir(scenario.homeDir),
      nowMs: scenario.nowMs,
      productScopeRoot: scenario.productScopeRoot,
      branchAssociatedWorktreeRoots: [],
      fs,
      locator,
      query: agentSearchQueryFromOptions({ ...query, agent: AGENT_SESSION_KIND.CLAUDE_CODE }),
    });
    return { results, error: null, fs };
  } catch (error: unknown) {
    return { results: [], error, fs };
  }
}

/** The moving-session store searched through the production locator whose ripgrep cannot start. */
export async function searchWithUnavailableLocator(
  scenario: GeneratedMovingSessionScenario,
  query: AgentSearchQueryOptions,
): Promise<LocatorSearchObservation> {
  const fs = movingSessionStore(scenario);
  return observeSearch(scenario, fs, createRipgrepTranscriptLocator(unstartableTranscriptLocatorRunner()), query);
}

export interface RejectedNeedleObservation extends LocatorSearchObservation {
  readonly locator: MemoryTranscriptLocator;
}

/** The moving-session store searched with a selector value the locator can never search for. */
export async function searchWithRejectedNeedle(
  scenario: GeneratedMovingSessionScenario,
  invalidCase: GeneratedInvalidNeedleCase,
): Promise<RejectedNeedleObservation> {
  const fs = movingSessionStore(scenario);
  const locator = new MemoryTranscriptLocator(fs);
  return { ...(await observeSearch(scenario, fs, locator, invalidCase.query)), locator };
}
