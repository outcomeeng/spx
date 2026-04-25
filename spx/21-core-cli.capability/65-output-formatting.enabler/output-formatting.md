# Output Formatting

PROVIDES four output formatters — text, JSON, markdown, and table — each accepting a WorkItemTree and configuration and returning a serialized string
SO THAT every spx command that displays work items
CAN render the same tree structure in the caller-requested format without duplicating serialization logic

## Assertions

### Scenarios

- Given a tree containing a capability at the root level, when formatted as text, then the capability name appears with no leading indentation ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree containing a feature at depth 1, when formatted as text, then the feature name appears indented by 2 spaces ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree containing a story at depth 2, when formatted as text, then the story name appears indented by 4 spaces ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a work item with status DONE, when formatted as text, then the output line contains "[DONE]" ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a work item with status IN_PROGRESS, when formatted as text, then the output line contains "[IN_PROGRESS]" ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a work item with a display number, when formatted as text, then the display number appears in the output line ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as JSON, then the output is valid JSON that JSON.parse accepts without throwing ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree with capabilities and features of known statuses, when formatted as JSON, then the parsed output contains a summary object with done, inProgress, and open integer counts ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as JSON, then summary counts include capabilities and features but exclude stories ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as JSON, then the JSON string uses 2-space indentation ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as markdown, then capabilities render as lines beginning with "# " ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as markdown, then features render as lines beginning with "## " ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as markdown, then stories render as lines beginning with "### " ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree with a work item at each level, when formatted as markdown, then status information and display numbers appear in the output ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as table, then every data row is enclosed with "|" characters at both ends ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as table, then the header row contains the columns Level, Number, Name, and Status ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as table, then a separator row of "---" cells appears between the header and data rows ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as table, then capability rows contain "| Capability", feature rows contain "| Feature", and story rows contain "| Story" ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree, when formatted as table, then the "|" column separators appear at the same horizontal position across all rows ([test](tests/output-formatting.scenario.l1.test.ts))
- Given a tree built by buildTree with a real DI-based status resolver, when formatted by all four formatters, then each formatter produces a non-empty string and the correct structural markers for its format ([test](tests/output-formatting.scenario.l1.test.ts))
