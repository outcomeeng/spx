import { resolve } from "node:path";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import {
  AGENT_SEARCH_MATCH_REASON,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_ROW_TYPE,
  type AgentSearchMatchReason,
} from "@/domains/agent/protocol";
import {
  agentSearchQueryFromOptions,
  type AgentSearchResult,
  pickupIdSearchLiteral,
  searchAgentSessions,
} from "@/domains/agent/search";
import { AGENT_CLI, createAgentDomain } from "@/interfaces/cli/agent";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  arbitraryAgentBranch,
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  arbitraryRejectedPiSessionVersions,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { agentSearchSwitchCommand } from "@testing/generators/agent/search";
import { piTranscript, piTranscriptPath } from "@testing/harnesses/agent/pi-resume";
import {
  agentSessionJsonlName,
  claudeCodeTranscript,
  claudeProjectTranscriptPath,
  codexTranscript,
  codexTranscriptPath,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

const PI_SEARCH_SAMPLE = {
  HOME_DIR: 501,
  PRODUCT_ROOT: 502,
  FOREIGN_ROOT: 503,
  CODEX_CWD: 504,
  CLAUDE_CWD: 505,
  PI_CWD: 506,
  FOREIGN_CWD: 507,
  NOW_MS: 508,
  PICKUP_ID: 509,
  CODEX_SESSION_ID: 510,
  CLAUDE_SESSION_ID: 511,
  PI_SESSION_ID: 512,
  MALFORMED_PI_SESSION_ID: 513,
  FOREIGN_PI_SESSION_ID: 514,
  BRANCH_HOME_DIR: 520,
  BRANCH_PRODUCT_ROOT: 521,
  BRANCH_ASSOCIATED_ROOT: 522,
  BRANCH_UNASSOCIATED_ROOT: 523,
  BRANCH_ASSOCIATED_CWD: 524,
  BRANCH_UNASSOCIATED_CWD: 525,
  BRANCH_NOW_MS: 526,
  BRANCH_NAME: 527,
  BRANCH_ASSOCIATED_SESSION_ID: 528,
  BRANCH_UNASSOCIATED_SESSION_ID: 529,
  CLI_HOME_DIR: 540,
  CLI_PRODUCT_ROOT: 541,
  CLI_CODEX_CWD: 542,
  CLI_CLAUDE_CWD: 543,
  CLI_PI_CWD: 544,
  CLI_NOW_MS: 545,
  CLI_CODEX_SESSION_ID: 546,
  CLI_CLAUDE_SESSION_ID: 547,
  CLI_PI_SESSION_ID: 548,
} as const;

export interface PiSearchPickupEvidence {
  readonly results: readonly AgentSearchResult[];
  readonly expectedSessionIds: readonly string[];
  readonly invalidSessionIds: readonly string[];
}

export interface PiSearchBranchEvidence {
  readonly results: readonly AgentSearchResult[];
  readonly associatedSessionId: string;
  readonly unassociatedSessionId: string;
  readonly associatedCwd: string;
  readonly branchReason: AgentSearchMatchReason;
}

export interface PiSearchCliSelectionEvidence {
  readonly stdout: string;
  readonly expectedSessionId: string;
  readonly excludedSessionIds: readonly string[];
}

export async function withPiSearchPickupEvidence(
  callback: (evidence: PiSearchPickupEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.HOME_DIR);
  const productRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.PRODUCT_ROOT);
  const foreignRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.FOREIGN_ROOT);
  const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productRoot), PI_SEARCH_SAMPLE.CODEX_CWD);
  const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productRoot), PI_SEARCH_SAMPLE.CLAUDE_CWD);
  const piCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productRoot), PI_SEARCH_SAMPLE.PI_CWD);
  const foreignCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(foreignRoot), PI_SEARCH_SAMPLE.FOREIGN_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), PI_SEARCH_SAMPLE.NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const pickupId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.PICKUP_ID);
  const marker = pickupIdSearchLiteral(pickupId);
  const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.CODEX_SESSION_ID);
  const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.CLAUDE_SESSION_ID);
  const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.PI_SESSION_ID);
  const malformedPiSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    PI_SEARCH_SAMPLE.MALFORMED_PI_SESSION_ID,
  );
  const foreignPiSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    PI_SEARCH_SAMPLE.FOREIGN_PI_SESSION_ID,
  );
  const rejectedVersions = sampleAgentResumeValue(arbitraryRejectedPiSessionVersions(), PI_SEARCH_SAMPLE.NOW_MS);

  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(codexSessionId)),
    `${codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp })}\n${marker}`,
    nowMs,
  );
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, claudeCwd, agentSessionJsonlName(claudeSessionId)),
    `${claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp })}\n${marker}`,
    nowMs - 1,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(piSessionId)),
    `${piTranscript({ sessionId: piSessionId, cwd: piCwd, timestamp })}\n${marker}`,
    nowMs - 2,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(malformedPiSessionId)),
    `${
      JSON.stringify({
        [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.PI_SESSION,
        [AGENT_SESSION_JSON_FIELDS.VERSION]: rejectedVersions.zero,
        [AGENT_SESSION_JSON_FIELDS.ID]: malformedPiSessionId,
        [AGENT_SESSION_JSON_FIELDS.TIMESTAMP]: timestamp,
        [AGENT_SESSION_JSON_FIELDS.CWD]: piCwd,
      })
    }\n${marker}`,
    nowMs - 3,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(foreignPiSessionId)),
    `${piTranscript({ sessionId: foreignPiSessionId, cwd: foreignCwd, timestamp })}\n${marker}`,
    nowMs - 4,
  );

  callback({
    results: await searchAgentSessions({
      agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
      nowMs,
      productScopeRoot: productRoot,
      fs,
      query: agentSearchQueryFromOptions({ pickupId }),
    }),
    expectedSessionIds: [codexSessionId, claudeSessionId, piSessionId],
    invalidSessionIds: [malformedPiSessionId, foreignPiSessionId],
  });
}

export async function withPiSearchBranchEvidence(
  callback: (evidence: PiSearchBranchEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.BRANCH_HOME_DIR);
  const productRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.BRANCH_PRODUCT_ROOT);
  const associatedRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    PI_SEARCH_SAMPLE.BRANCH_ASSOCIATED_ROOT,
  );
  const unassociatedRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    PI_SEARCH_SAMPLE.BRANCH_UNASSOCIATED_ROOT,
  );
  const associatedCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(associatedRoot),
    PI_SEARCH_SAMPLE.BRANCH_ASSOCIATED_CWD,
  );
  const unassociatedCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(unassociatedRoot),
    PI_SEARCH_SAMPLE.BRANCH_UNASSOCIATED_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), PI_SEARCH_SAMPLE.BRANCH_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), PI_SEARCH_SAMPLE.BRANCH_NAME);
  const associatedSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    PI_SEARCH_SAMPLE.BRANCH_ASSOCIATED_SESSION_ID,
  );
  const unassociatedSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    PI_SEARCH_SAMPLE.BRANCH_UNASSOCIATED_SESSION_ID,
  );

  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(associatedSessionId)),
    piTranscript({ sessionId: associatedSessionId, cwd: associatedCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(unassociatedSessionId)),
    `${piTranscript({ sessionId: unassociatedSessionId, cwd: unassociatedCwd, timestamp })}\n${
      agentSearchSwitchCommand(branch)
    }`,
    nowMs - 1,
  );

  callback({
    results: await searchAgentSessions({
      agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
      nowMs,
      productScopeRoot: productRoot,
      branchAssociatedWorktreeRoots: [associatedRoot],
      fs,
      query: agentSearchQueryFromOptions({ branch }),
    }),
    associatedSessionId,
    unassociatedSessionId,
    associatedCwd,
    branchReason: AGENT_SEARCH_MATCH_REASON.BRANCH,
  });
}

export async function withPiSearchCliSelectionEvidence(
  callback: (evidence: PiSearchCliSelectionEvidence) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.CLI_HOME_DIR);
  const productRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), PI_SEARCH_SAMPLE.CLI_PRODUCT_ROOT);
  const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productRoot), PI_SEARCH_SAMPLE.CLI_CODEX_CWD);
  const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productRoot), PI_SEARCH_SAMPLE.CLI_CLAUDE_CWD);
  const piCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productRoot), PI_SEARCH_SAMPLE.CLI_PI_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), PI_SEARCH_SAMPLE.CLI_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.CLI_CODEX_SESSION_ID);
  const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.CLI_CLAUDE_SESSION_ID);
  const piSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), PI_SEARCH_SAMPLE.CLI_PI_SESSION_ID);
  const stdout: string[] = [];
  const stderr: string[] = [];

  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(codexSessionId)),
    codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, claudeCwd, agentSessionJsonlName(claudeSessionId)),
    claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    piTranscriptPath(homeDir, agentSessionJsonlName(piSessionId)),
    piTranscript({ sessionId: piSessionId, cwd: piCwd, timestamp }),
    nowMs,
  );

  await createCliProgram({
    domains: [createAgentDomain({
      searchDeps: {
        fs,
        agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
        nowMs: () => nowMs,
        resolveProductScopeRoot: async () => productRoot,
        resolveBranchAssociatedWorktreeRoots: async () => [],
      },
    })],
    processCwd: () => resolve(productRoot),
    writeStdout: (output) => stdout.push(output),
    writeStderr: (output) => stderr.push(output),
  }).parseAsync([
    AGENT_CLI.commandName,
    AGENT_CLI.searchCommandName,
    AGENT_CLI.flags.agent,
    AGENT_SESSION_KIND.PI,
    AGENT_CLI.flags.json,
  ], { from: SPX_COMMANDER_PARSE_SOURCE });

  callback({
    stdout: stdout.join(""),
    expectedSessionId: piSessionId,
    excludedSessionIds: [codexSessionId, claudeSessionId],
  });
}
