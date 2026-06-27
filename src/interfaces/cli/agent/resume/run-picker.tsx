import { render } from "ink";
import type { ReactElement } from "react";

import type { AgentResumeCandidate } from "@/domains/agent";

import { AgentResumePicker } from "./AgentResumePicker";

export type AgentResumePickerResult =
  | { readonly kind: "selected"; readonly candidate: AgentResumeCandidate }
  | { readonly kind: "quit" };

export const AGENT_RESUME_PICKER_RESULT = {
  SELECTED: "selected",
  QUIT: "quit",
} as const;

export function selectedAgentResumeCandidate(candidate: AgentResumeCandidate): AgentResumePickerResult {
  return { kind: AGENT_RESUME_PICKER_RESULT.SELECTED, candidate };
}

export function quitAgentResumePicker(): AgentResumePickerResult {
  return { kind: AGENT_RESUME_PICKER_RESULT.QUIT };
}

export interface AgentResumePickerInstance {
  unmount(): void;
  waitUntilExit(): Promise<unknown>;
}

export type AgentResumePickerRenderer = (element: ReactElement) => AgentResumePickerInstance;

export async function runAgentResumePicker(
  candidates: readonly AgentResumeCandidate[],
  renderPicker: AgentResumePickerRenderer = render,
): Promise<AgentResumePickerResult> {
  let result: AgentResumePickerResult = quitAgentResumePicker();
  let unmount = (): void => {};

  const instance = renderPicker(
    <AgentResumePicker
      candidates={candidates}
      onChoose={(candidate) => {
        result = selectedAgentResumeCandidate(candidate);
        unmount();
      }}
      onQuit={() => {
        result = quitAgentResumePicker();
        unmount();
      }}
    />,
  );
  unmount = instance.unmount;

  await instance.waitUntilExit();
  return result;
}
