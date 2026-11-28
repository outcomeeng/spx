import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  evidenceValidatorFor,
  VERIFY_SCOPE_PAYLOAD_FIELD,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import { EVIDENCE_PAYLOAD_HELP, VERIFICATION_RUN_CLI_SURFACE, VERIFY_CLI } from "@/interfaces/cli/verify";
import { arbitraryArgvSafeToken, sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { type BuiltRunHelp, flagOf, observeBuiltRunHelp } from "@testing/harnesses/verify/built-cli";
import {
  enumeratedValueCandidates,
  EVIDENCE_HELP_KIND,
  type EvidenceHelpCase,
  evidenceHelpCases,
  type EvidenceHelpKind,
  evidenceRejectionReason,
  helpAllowedValues,
  helpFieldLine,
  helpOptionFlags,
  helpSectionLines,
  payloadFieldPaths,
  rejectedFieldPaths,
  rejectsAsUnknownOption,
  stringAt,
  unenumeratedValue,
  withField,
  withoutField,
} from "@testing/harnesses/verify/evidence-help";
import { observeVerificationInvocation } from "@testing/harnesses/verify/rejected-invocation";

function helpOf(helps: readonly BuiltRunHelp[], commandPath: readonly string[]): string {
  const found = helps.find((entry) => entry.commandPath.join(" ") === commandPath.join(" "));
  if (found === undefined) throw new Error(`no help observed for ${commandPath.join(" ")}`);
  expect(found.help.exitCode, found.help.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return found.help.stdout;
}

function registeredTypes(kind: EvidenceHelpKind): VerifyVerificationType[] {
  return Object.values(VERIFY_VERIFICATION_TYPE).filter((type) => evidenceValidatorFor(type, kind) !== undefined);
}

/** Each field a removal makes the validator name must have its own help line. */
function expectRequiredFieldsNamed(section: readonly string[], helpCase: EvidenceHelpCase): void {
  for (const path of payloadFieldPaths(helpCase.payload)) {
    const reason = evidenceRejectionReason(
      helpCase.verificationType,
      helpCase.kind,
      withoutField(helpCase.payload, path),
    );
    if (reason === undefined) continue;
    for (const name of rejectedFieldPaths(reason)) {
      expect(helpFieldLine(section, name), `${helpCase.verificationType} ${helpCase.kind} help names ${name}`)
        .toBeDefined();
    }
  }
}

/** Each string field the validator refuses an arbitrary value for lists exactly the candidate values it accepts. */
function expectEnumeratedValuesListed(section: readonly string[], helpCase: EvidenceHelpCase): void {
  const candidates = enumeratedValueCandidates();
  const outsider = unenumeratedValue(candidates);
  for (const path of payloadFieldPaths(helpCase.payload)) {
    if (stringAt(helpCase.payload, path) === undefined) continue;
    const name = path.join(".");
    const namesField = (value: string): boolean => {
      const reason = evidenceRejectionReason(
        helpCase.verificationType,
        helpCase.kind,
        withField(helpCase.payload, path, value),
      );
      return reason !== undefined && rejectedFieldPaths(reason).includes(name);
    };
    if (!namesField(outsider)) continue;
    const line = helpFieldLine(section, name);
    expect(line, `${helpCase.verificationType} ${helpCase.kind} help names ${name}`).toBeDefined();
    const accepted = candidates.filter((candidate) => !namesField(candidate));
    expect(new Set(helpAllowedValues(line ?? ""))).toStrictEqual(new Set(accepted));
  }
}

describe("record-run evidence help through the built executable", () => {
  it(
    "scope add and finding add help name every payload field each registered type's validator requires, nested fields included, with each enumerated field's allowed values",
    async () => {
      const helps = await observeBuiltRunHelp();
      const kinds: readonly [EvidenceHelpKind, readonly string[]][] = [
        [EVIDENCE_HELP_KIND.SCOPE, [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName]],
        [EVIDENCE_HELP_KIND.FINDING, [VERIFY_CLI.findingCommandName, VERIFY_CLI.addCommandName]],
      ];
      for (const [kind, commandPath] of kinds) {
        const help = helpOf(helps, commandPath);
        const types = registeredTypes(kind);
        expect(types.length).toBeGreaterThan(0);
        for (const verificationType of types) {
          const section = helpSectionLines(help, verificationType);
          expect(section.length, `${commandPath.join(" ")} help: ${verificationType}`).toBeGreaterThan(0);
          const cases = evidenceHelpCases(verificationType, kind);
          expect(cases.length).toBeGreaterThan(0);
          for (const helpCase of cases) {
            expect(evidenceRejectionReason(verificationType, kind, helpCase.payload)).toBeUndefined();
            expectRequiredFieldsNamed(section, helpCase);
            expectEnumeratedValuesListed(section, helpCase);
          }
        }
      }
      const scopeAccounting = helpSectionLines(
        helpOf(helps, [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName]),
        EVIDENCE_PAYLOAD_HELP.everyTypeHeading,
      );
      for (const field of Object.values(VERIFY_SCOPE_PAYLOAD_FIELD)) {
        expect(helpFieldLine(scopeAccounting, field)).toBeDefined();
      }
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "each run subcommand's help lists every option the subcommand accepts and no other, so --change appears only for start, list, and compare",
    async () => {
      const helps = await observeBuiltRunHelp();
      const listedByCommand = helps.map((entry) => ({
        commandPath: entry.commandPath,
        flags: helpOptionFlags(helpOf(helps, entry.commandPath)),
      }));
      const everyFlag = [...new Set(listedByCommand.flatMap((entry) => entry.flags))];
      const value = sampleVerifyTestValue(arbitraryArgvSafeToken());
      for (const { commandPath, flags } of listedByCommand) {
        const listedArgv = flags.flatMap((flag) => [flag, value]);
        const commandArgv = [
          VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
          VERIFICATION_RUN_CLI_SURFACE.runCommandName,
          ...commandPath,
        ];
        const listed = await observeVerificationInvocation([...commandArgv, ...listedArgv]);
        for (const flag of flags) {
          expect(rejectsAsUnknownOption(listed.stderr, flag), `${commandPath.join(" ")} ${flag}`).toBe(false);
        }
        for (const flag of everyFlag.filter((candidate) => !flags.includes(candidate))) {
          const unlisted = await observeVerificationInvocation([...commandArgv, ...listedArgv, flag, value]);
          expect(rejectsAsUnknownOption(unlisted.stderr, flag), `${commandPath.join(" ")} ${flag}`).toBe(true);
        }
      }
      const changeFlag = flagOf(VERIFY_CLI.changeOption);
      const withChange = listedByCommand.filter((entry) => entry.flags.includes(changeFlag)).map((entry) =>
        entry.commandPath.join(" ")
      );
      expect(new Set(withChange)).toStrictEqual(
        new Set([VERIFY_CLI.startCommandName, VERIFY_CLI.listCommandName, VERIFY_CLI.compareCommandName]),
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "finish help states that a scope unit's judgedPaths accounts for a changed path the head holds and its judgedDeletions for a path the changeset deletes",
    async () => {
      const help = helpOf(await observeBuiltRunHelp(), [VERIFY_CLI.finishCommandName]).replace(/\s+/g, " ");
      expect(help).toContain(`${VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS} accounts for a changed path the head holds`);
      expect(help).toContain(
        `${VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS} accounts for a path the changeset deletes`,
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
