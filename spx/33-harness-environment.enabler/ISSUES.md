# Known Issues: 33-harness-environment.enabler

## Unregistered agent ids are rejected only for instruction files and the agents map

**Evidence:** `tests/harness-environment-descriptor.compliance.l1.test.ts` line 149 states the rule that configured instruction files, marketplaces, plugins, and skills reference registered agent ids. Only the instruction-file `targetAgents` entry and the agents-map key are exercised with an unregistered agent id. No case supplies one to a marketplace, plugin, or skill entry.

**Impact:** a descriptor that skips agent validation for marketplace, plugin, and skill entries passes every linked test while the rule is unfulfilled.

**Settlement condition:** a violating case per entry kind (marketplace, plugin, skill) supplies an unregistered agent id and observes the rejection.
