import * as fc from "fast-check";

import { sampleLiteralTestValue } from "@testing/generators/literal/literal";

const IDENTIFIER_MIN_REST_LENGTH = 2;
const IDENTIFIER_MAX_REST_LENGTH = 8;
const IDENTIFIER_PREFIX = "spx";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const LOGICAL_AND_OPERATOR = "&&";
const TASK_MARKER_PLACEHOLDER = "replace placeholder";

export const ESLINT_MIRROR_UNICORN_RULE_FIXTURE = {
  PREFER_NODE_PROTOCOL: "prefer-node-protocol",
  PREFER_CODE_POINT: "prefer-code-point",
  PREFER_SINGLE_CALL: "prefer-single-call",
  PREFER_STRING_RAW: "prefer-string-raw",
} as const;

export const ESLINT_MIRROR_TEST_GENERATOR = {
  cognitiveComplexitySource: sampleCognitiveComplexitySource,
  domainVocabularySource: sampleDomainVocabularySource,
  duplicateImportSource: sampleDuplicateImportSource,
  identicalExpressionSource: sampleIdenticalExpressionSource,
  objectHasOwnSource: sampleObjectHasOwnSource,
  pseudoRandomSource: samplePseudoRandomSource,
  taskMarkerCommentSource: sampleTaskMarkerCommentSource,
  unicornViolationFixtures: sampleUnicornViolationFixtures,
} as const;

function sampleIdenticalExpressionSource(): string {
  return sampleLiteralTestValue(
    fc.record({
      valueIdentifier: arbitraryIdentifier(),
      flagIdentifier: arbitraryIdentifier(),
    }).filter(({ valueIdentifier, flagIdentifier }) => valueIdentifier !== flagIdentifier).map((
      { valueIdentifier, flagIdentifier },
    ) =>
      `const ${valueIdentifier} = true;\nconst ${flagIdentifier} = ${valueIdentifier} ${LOGICAL_AND_OPERATOR} ${valueIdentifier};\n`
    ),
  );
}

function samplePseudoRandomSource(): string {
  return sampleLiteralTestValue(
    arbitraryIdentifier().map((identifier) => `const ${identifier} = Math.random();\n${identifier};\n`),
  );
}

function sampleCognitiveComplexitySource(): string {
  return sampleLiteralTestValue(
    fc.record({
      functionName: arbitraryIdentifier(),
      parameterName: arbitraryIdentifier(),
    }).map(({ functionName, parameterName }) =>
      `function ${functionName}(${parameterName}) {\nif (${parameterName}) {\nreturn 1;\n}\nreturn 0;\n}\n${functionName}(true);\n`
    ),
  );
}

function sampleObjectHasOwnSource(): string {
  return sampleLiteralTestValue(
    fc.record({
      objectIdentifier: arbitraryIdentifier(),
      propertyKey: arbitraryIdentifier(),
    }).map(({ objectIdentifier, propertyKey }) =>
      `const ${objectIdentifier} = {};\nObject.prototype.hasOwnProperty.call(${objectIdentifier}, "${propertyKey}");\n`
    ),
  );
}

function sampleDuplicateImportSource(): string {
  return sampleLiteralTestValue(
    fc.record({
      firstImport: arbitraryIdentifier(),
      secondImport: arbitraryIdentifier(),
    }).filter(({ firstImport, secondImport }) => firstImport !== secondImport).map(({ firstImport, secondImport }) =>
      `import { readFileSync as ${firstImport} } from "fs";\nimport { writeFileSync as ${secondImport} } from "fs";\n${firstImport};\n${secondImport};\n`
    ),
  );
}

function sampleTaskMarkerCommentSource(marker: string): string {
  return sampleLiteralTestValue(
    arbitraryIdentifier().map((identifier) =>
      `// ${marker}: ${TASK_MARKER_PLACEHOLDER}\nconst ${identifier} = 1;\n${identifier};\n`
    ),
  );
}

function sampleDomainVocabularySource(): string {
  return sampleLiteralTestValue(
    arbitraryIdentifier().map((identifier) => `// session todo directory\nconst ${identifier} = 1;\n${identifier};\n`),
  );
}

function sampleUnicornViolationFixtures(): Record<string, string> {
  return {
    [ESLINT_MIRROR_UNICORN_RULE_FIXTURE.PREFER_NODE_PROTOCOL]: sampleLiteralTestValue(
      arbitraryIdentifier().map((identifier) =>
        `import { readFileSync as ${identifier} } from "fs";\n${identifier};\n`
      ),
    ),
    [ESLINT_MIRROR_UNICORN_RULE_FIXTURE.PREFER_CODE_POINT]: sampleLiteralTestValue(
      arbitraryIdentifier().map((identifier) => `const ${identifier} = "a".charCodeAt(0);\n${identifier};\n`),
    ),
    [ESLINT_MIRROR_UNICORN_RULE_FIXTURE.PREFER_SINGLE_CALL]: sampleLiteralTestValue(
      arbitraryIdentifier().map((identifier) =>
        `const ${identifier} = [];\n${identifier}.push(1);\n${identifier}.push(2);\n`
      ),
    ),
    [ESLINT_MIRROR_UNICORN_RULE_FIXTURE.PREFER_STRING_RAW]: sampleLiteralTestValue(
      arbitraryIdentifier().map((identifier) => `const ${identifier} = "a\\\\b";\n${identifier};\n`),
    ),
  };
}

function arbitraryIdentifier(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...LETTERS),
      fc.array(fc.constantFrom(...LETTERS), {
        minLength: IDENTIFIER_MIN_REST_LENGTH,
        maxLength: IDENTIFIER_MAX_REST_LENGTH,
      }),
    )
    .map(([first, rest]) => `${IDENTIFIER_PREFIX}${first}${rest.join("")}`);
}
