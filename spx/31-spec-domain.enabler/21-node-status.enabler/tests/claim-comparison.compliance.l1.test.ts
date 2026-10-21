import { describe, expect, it } from "vitest";

import {
  compareNodeStatusClaims,
  NODE_STATUS_CLAIM_DIFFERENCE,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_EVIDENCE_OUTCOME,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  committedClaimSet,
  nodeStatusAttribution,
  withClaimEntry,
  withClaimState,
  withoutClaim,
  withoutClaimEntry,
} from "@testing/harnesses/node-status/node-status";

describe("ALWAYS: the committed-status comparison reports a difference exactly when a node's state or an entry's verdict or read set differs between the committed and the regenerated claim, and reports none when only pin commits differ", () => {
  it("reports none for a regenerated claim set identical to the committed one", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);

    expect(compareNodeStatusClaims(committed, committedClaimSet(fixture))).toEqual([]);
  });

  it("reports none when only the pin commit of one entry differs", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const [nodeId = ""] = fixture.nodeIds;
    const [testKey = ""] = fixture.testKeys;

    const regenerated = withClaimEntry(
      committedClaimSet(fixture),
      { nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: testKey },
      (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.COMMIT]: fixture.commits[1] }),
    );

    expect(compareNodeStatusClaims(committedClaimSet(fixture), regenerated)).toEqual([]);
  });

  it("reports none when the pin commit of every entry of every node differs", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const repinned = fixture.nodeIds.reduce(
      (claims, nodeId) =>
        [
          ...fixture.testKeys.map((key) => ({ nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key })),
          { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
        ].reduce(
          (accumulated, location) =>
            withClaimEntry(
              accumulated,
              location,
              (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.COMMIT]: fixture.commits[1] }),
            ),
          claims,
        ),
      committedClaimSet(fixture),
    );

    expect(compareNodeStatusClaims(committedClaimSet(fixture), repinned)).toEqual([]);
  });

  it("reports none when only the actor of an attributed entry differs", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const [nodeId = ""] = fixture.nodeIds;

    const regenerated = withClaimEntry(
      committedClaimSet(fixture),
      { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
      (entry) => ({
        ...entry,
        [NODE_STATUS_CLAIM_FIELD.ACTOR]:
          nodeStatusAttribution(fixture.actorIds[1], fixture.runs[0])[NODE_STATUS_CLAIM_FIELD.ACTOR],
      }),
    );

    expect(compareNodeStatusClaims(committedClaimSet(fixture), regenerated)).toEqual([]);
  });

  it("reports none when only the run of an attributed entry differs", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const [nodeId = ""] = fixture.nodeIds;

    const regenerated = withClaimEntry(
      committedClaimSet(fixture),
      { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
      (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.RUN]: fixture.runs[1] }),
    );

    expect(compareNodeStatusClaims(committedClaimSet(fixture), regenerated)).toEqual([]);
  });

  it("reports the node, and no entry, when the state of a node differs, for every state other than the committed one", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [nodeId = ""] = fixture.nodeIds;
    const committedState = committed.get(nodeId)?.[NODE_STATUS_CLAIM_FIELD.STATE];

    for (const state of Object.values(SPEC_TREE_NODE_STATE).filter((candidate) => candidate !== committedState)) {
      expect(compareNodeStatusClaims(committed, withClaimState(committed, nodeId, state)), state).toEqual([
        { nodeId, kind: NODE_STATUS_CLAIM_DIFFERENCE.STATE },
      ]);
    }
  });

  it("reports the node, section and key of an entry whose verdict differs, in a test entry and in an audit entry", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [nodeId = ""] = fixture.nodeIds;
    const [testKey = ""] = fixture.testKeys;

    for (
      const location of [
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: testKey },
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
      ]
    ) {
      const regenerated = withClaimEntry(
        committed,
        location,
        (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.FAILED }),
      );

      expect(compareNodeStatusClaims(committed, regenerated), location.section).toEqual([
        { ...location, kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY },
      ]);
    }
  });

  it("reports the node, section and key of an entry whose read set differs, in a test entry and in an audit entry", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [nodeId = ""] = fixture.nodeIds;
    const [testKey = ""] = fixture.testKeys;

    for (
      const location of [
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: testKey },
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
      ]
    ) {
      const regenerated = withClaimEntry(
        committed,
        location,
        (entry) => ({
          ...entry,
          [NODE_STATUS_CLAIM_FIELD.READ]: [...(entry[NODE_STATUS_CLAIM_FIELD.READ] ?? []), fixture.extraReadPath],
        }),
      );

      expect(compareNodeStatusClaims(committed, regenerated), location.section).toEqual([
        { ...location, kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY },
      ]);
    }
  });

  it("reports one difference per mutation when several nodes differ and an entry also changes its pin commit", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [firstNode = "", secondNode = ""] = fixture.nodeIds;
    const [testKey = ""] = fixture.testKeys;
    const verdictLocation = { nodeId: secondNode, section: NODE_STATUS_CLAIM_SECTION.TEST, key: testKey };
    const readLocation = { nodeId: firstNode, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug };
    const repinnedLocation = { nodeId: secondNode, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug };

    const regenerated = [
      (claims: typeof committed) =>
        withClaimState(
          claims,
          firstNode,
          Object.values(SPEC_TREE_NODE_STATE).find((state) => state !== SPEC_TREE_NODE_STATE.PASSING)
            ?? SPEC_TREE_NODE_STATE.PASSING,
        ),
      (claims: typeof committed) =>
        withClaimEntry(
          claims,
          verdictLocation,
          (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.FAILED }),
        ),
      (claims: typeof committed) =>
        withClaimEntry(
          claims,
          readLocation,
          (entry) => ({
            ...entry,
            [NODE_STATUS_CLAIM_FIELD.READ]: [...(entry[NODE_STATUS_CLAIM_FIELD.READ] ?? []), fixture.extraReadPath],
          }),
        ),
      (claims: typeof committed) =>
        withClaimEntry(
          claims,
          repinnedLocation,
          (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.COMMIT]: fixture.commits[1] }),
        ),
    ].reduce((claims, mutate) => mutate(claims), committed);

    const differences = compareNodeStatusClaims(committed, regenerated);

    expect(differences).toHaveLength(3);
    expect(differences).toEqual(
      expect.arrayContaining([
        { nodeId: firstNode, kind: NODE_STATUS_CLAIM_DIFFERENCE.STATE },
        { ...verdictLocation, kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY },
        { ...readLocation, kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY },
      ]),
    );
  });

  it("reports none when only the order or the repetition of an entry's read paths differs", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [nodeId = ""] = fixture.nodeIds;
    const [testKey = ""] = fixture.testKeys;

    for (
      const location of [
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: testKey },
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
      ]
    ) {
      const regenerated = withClaimEntry(
        committed,
        location,
        (entry) => ({
          ...entry,
          [NODE_STATUS_CLAIM_FIELD.READ]: [...fixture.readPaths].reverse().concat(fixture.readPaths),
        }),
      );

      expect(compareNodeStatusClaims(committed, regenerated), location.section).toEqual([]);
    }
  });

  it("reports the entry, in either direction, when it is present in the committed claim only or in the regenerated claim only", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [nodeId = ""] = fixture.nodeIds;
    const [testKey = ""] = fixture.testKeys;

    for (
      const location of [
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: testKey },
        { nodeId, section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: fixture.auditSlug },
      ]
    ) {
      const withoutEntry = withoutClaimEntry(committed, location);
      const expected = [{ ...location, kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY }];

      expect(compareNodeStatusClaims(committed, withoutEntry), `removed ${location.section}`).toEqual(expected);
      expect(compareNodeStatusClaims(withoutEntry, committed), `added ${location.section}`).toEqual(expected);
    }
  });

  it("reports the node state and every entry of a node, in either direction, when the node is present in one claim set only", () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.claimComparison());
    const committed = committedClaimSet(fixture);
    const [nodeId = ""] = fixture.nodeIds;
    const without = withoutClaim(committed, nodeId);
    const expected = [
      { nodeId, kind: NODE_STATUS_CLAIM_DIFFERENCE.STATE },
      ...fixture.testKeys.map((key) => ({
        nodeId,
        kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY,
        section: NODE_STATUS_CLAIM_SECTION.TEST,
        key,
      })),
      {
        nodeId,
        kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY,
        section: NODE_STATUS_CLAIM_SECTION.AUDIT,
        key: fixture.auditSlug,
      },
    ];

    for (
      const differences of [compareNodeStatusClaims(committed, without), compareNodeStatusClaims(without, committed)]
    ) {
      expect(differences).toHaveLength(expected.length);
      expect(differences).toEqual(expect.arrayContaining(expected));
    }
  });
});
