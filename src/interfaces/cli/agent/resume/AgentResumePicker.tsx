import { Box, Text, useInput } from "ink";
import { useState } from "react";

import {
  AGENT_RESUME_PICKER_ACTION,
  AGENT_RESUME_TEXT,
  AGENT_SESSION_LABEL,
  type AgentResumeCandidate,
  initialAgentResumePickerState,
  reduceAgentResumePickerState,
  resolveAgentResumePickerAction,
} from "@/domains/agent";

export interface AgentResumePickerProps {
  readonly candidates: readonly AgentResumeCandidate[];
  readonly onChoose: (candidate: AgentResumeCandidate) => void;
  readonly onQuit: () => void;
}

const SELECTED_COLOR = "cyan";
const SELECTED_MARKER = ">";
const UNSELECTED_MARKER = " ";

export function AgentResumePicker(props: AgentResumePickerProps) {
  const [state, setState] = useState(initialAgentResumePickerState);

  useInput((input, key) => {
    const action = resolveAgentResumePickerAction({
      input,
      upArrow: key.upArrow,
      downArrow: key.downArrow,
      return: key.return,
      escape: key.escape,
    });
    if (action === AGENT_RESUME_PICKER_ACTION.CHOOSE) {
      const selected = props.candidates.at(state.selectedIndex);
      if (selected !== undefined) {
        props.onChoose(selected);
      }
      return;
    }
    if (action === AGENT_RESUME_PICKER_ACTION.QUIT) {
      props.onQuit();
      return;
    }
    setState((current) => reduceAgentResumePickerState(current, action, props.candidates.length));
  });

  if (props.candidates.length === 0) {
    return <Text>{AGENT_RESUME_TEXT.NO_MATCHES}</Text>;
  }

  return (
    <Box flexDirection="column">
      {props.candidates.map((candidate, index) => (
        <Text
          key={`${candidate.agent}:${candidate.sessionId}`}
          color={index === state.selectedIndex ? SELECTED_COLOR : undefined}
        >
          {index === state.selectedIndex ? SELECTED_MARKER : UNSELECTED_MARKER} {AGENT_SESSION_LABEL[candidate.agent]}
          {" "}
          {candidate.sessionId} {candidate.cwd}
        </Text>
      ))}
    </Box>
  );
}
