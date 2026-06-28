import { render } from "ink-testing-library";
import { createElement } from "react";

import type { AgentResumeCandidate } from "@/domains/agent";
import { AgentResumePicker } from "@/interfaces/cli/agent/resume/AgentResumePicker";

const KEY = {
  ARROW_UP: "\u001B[A",
  ARROW_DOWN: "\u001B[B",
  ENTER: "\r",
  ESCAPE: "\u001B",
  QUIT: "q",
} as const;

const INK_ESCAPE_FLUSH_MS = 40;

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushEscape(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, INK_ESCAPE_FLUSH_MS));
  await flush();
}

export interface RenderAgentResumePickerOptions {
  readonly candidates: readonly AgentResumeCandidate[];
  readonly onChoose?: (candidate: AgentResumeCandidate) => void;
  readonly onQuit?: () => void;
}

export interface AgentResumePickerView {
  frame(): string;
  rowLinesFor(sessionId: string): string[];
  arrowDown(): Promise<void>;
  arrowUp(): Promise<void>;
  enter(): Promise<void>;
  quitWithQ(): Promise<void>;
  escape(): Promise<void>;
  unmount(): void;
}

export function renderAgentResumePickerView(options: RenderAgentResumePickerOptions): AgentResumePickerView {
  const instance = render(
    createElement(AgentResumePicker, {
      candidates: options.candidates,
      onChoose: options.onChoose ?? (() => {}),
      onQuit: options.onQuit ?? (() => {}),
    }),
  );

  const lines = (): string[] => (instance.lastFrame() ?? "").split("\n");
  const write = async (sequence: string, settle: () => Promise<void> = flush): Promise<void> => {
    instance.stdin.write(sequence);
    await settle();
  };

  return {
    frame: () => instance.lastFrame() ?? "",
    rowLinesFor: (sessionId) => lines().filter((line) => line.includes(sessionId)),
    arrowDown: () => write(KEY.ARROW_DOWN),
    arrowUp: () => write(KEY.ARROW_UP),
    enter: () => write(KEY.ENTER),
    quitWithQ: () => write(KEY.QUIT),
    escape: () => write(KEY.ESCAPE, flushEscape),
    unmount: () => instance.unmount(),
  };
}
