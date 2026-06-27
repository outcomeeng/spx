import { Box, Text, useInput } from "ink";
import { useState } from "react";

import { AGENT_RESUME_TEXT, AGENT_SESSION_LABEL, type AgentResumeCandidate } from "@/domains/agent";

export interface AgentResumePickerProps {
  readonly candidates: readonly AgentResumeCandidate[];
  readonly onChoose: (candidate: AgentResumeCandidate) => void;
  readonly onQuit: () => void;
}

const MOVE_FIRST_DELTA = -1;
const MOVE_LAST_DELTA = 1;
const FIRST_INDEX = 0;
const QUIT_INPUT = "q";
const SELECTED_COLOR = "cyan";
const SELECTED_MARKER = ">";
const UNSELECTED_MARKER = " ";

export function AgentResumePicker(props: AgentResumePickerProps) {
  const [selectedIndex, setSelectedIndex] = useStateIndex(props.candidates.length);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(MOVE_FIRST_DELTA);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(MOVE_LAST_DELTA);
      return;
    }
    if (key.return) {
      const selected = props.candidates.at(selectedIndex);
      if (selected !== undefined) {
        props.onChoose(selected);
      }
      return;
    }
    if (key.escape || input === QUIT_INPUT) {
      props.onQuit();
    }
  });

  if (props.candidates.length === 0) {
    return <Text>{AGENT_RESUME_TEXT.NO_MATCHES}</Text>;
  }

  return (
    <Box flexDirection="column">
      {props.candidates.map((candidate, index) => (
        <Text
          key={`${candidate.agent}:${candidate.sessionId}`}
          color={index === selectedIndex ? SELECTED_COLOR : undefined}
        >
          {index === selectedIndex ? SELECTED_MARKER : UNSELECTED_MARKER} {AGENT_SESSION_LABEL[candidate.agent]}{" "}
          {candidate.sessionId} {candidate.cwd}
        </Text>
      ))}
    </Box>
  );
}

function useStateIndex(count: number): readonly [number, (delta: number) => void] {
  const [selectedIndex, setSelectedIndexValue] = useState(FIRST_INDEX);
  const setSelectedIndex = (delta: number): void => {
    setSelectedIndexValue((current) => {
      const next = current + delta;
      if (next < FIRST_INDEX) return FIRST_INDEX;
      return Math.min(Math.max(count - 1, FIRST_INDEX), next);
    });
  };
  return [selectedIndex, setSelectedIndex] as const;
}
