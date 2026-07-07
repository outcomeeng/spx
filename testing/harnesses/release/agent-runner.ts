import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { AgentRunner, AgentRunRequest } from "@/agent/agent-runner";
import { CHANGELOG_PATH_DATA_BLOCK_CLOSE, CHANGELOG_PATH_DATA_BLOCK_OPEN } from "@/domains/release/release-notes";
import { isPathContained } from "@/lib/file-system/pathContainment";

/**
 * A recording + writing AgentRunner double for release-notes composition tests.
 *
 * The production agent is a network- and credential-bound, non-deterministic
 * dependency (the Claude Agent SDK), so the composition's path resolution, prompt
 * assembly, and read-back validation are exercised at l1 by injecting this double
 * for the agent alone. It records every request so a test can inspect the prompt
 * the composition assembled (Stage 5 observability), and it writes a predetermined
 * changelog body to the prompt's staged output path after checking the request's
 * working directory, modelling the artifact the real agent would write so the
 * composition's injected reader performs a real filesystem read-back rather
 * than reading from a double.
 */
export class RecordingWritingAgentRunner implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  constructor(
    private readonly expectedWorkingDirectory: string,
    private readonly outputPath: string,
    private readonly changelogContent: string,
  ) {}

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    if (!isInsideOrEqual(this.expectedWorkingDirectory, request.workingDirectory)) {
      throw new Error("Agent runner double received the wrong working directory");
    }
    const outputPath = promptChangelogPath(request.prompt) ?? this.outputPath;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, this.changelogContent);
  }

  /** The prompt of the most recent request, for inspecting what the composition assembled. */
  get lastPrompt(): string {
    const last = this.requests.at(-1);
    if (last === undefined) {
      throw new Error("Agent runner double received no request");
    }
    return last.prompt;
  }
}

function promptChangelogPath(prompt: string): string | undefined {
  const openIndex = prompt.indexOf(CHANGELOG_PATH_DATA_BLOCK_OPEN);
  if (openIndex === -1) {
    return undefined;
  }
  const valueStart = openIndex + CHANGELOG_PATH_DATA_BLOCK_OPEN.length;
  const closeIndex = prompt.indexOf(CHANGELOG_PATH_DATA_BLOCK_CLOSE, valueStart);
  if (closeIndex === -1) {
    return undefined;
  }
  const rawJson = prompt.slice(valueStart, closeIndex).trim();
  const parsed = JSON.parse(rawJson) as unknown;
  return typeof parsed === "string" ? parsed : undefined;
}

function isInsideOrEqual(parent: string, child: string): boolean {
  return isPathContained(resolve(parent), resolve(child));
}
