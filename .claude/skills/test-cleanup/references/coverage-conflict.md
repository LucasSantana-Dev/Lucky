# Coverage/Target Conflict Resolution

Before touching anything, verify the proportionality target is achievable given the project's coverage threshold. This is the most common reason cleanup stalls.

```bash
# Count testable functions in the covered source
find src extension lib -name '*.ts' -o -name '*.js' 2>/dev/null \
  | grep -vE "spec|test|__tests__|node_modules" \
  | xargs grep -cE "^\s*(function|const \w+ = \(|export (default )?(function|const)|class \w+)" \
    2>/dev/null | awk -F: '{s+=$2} END {print s}'
```

**Compatibility check:**

If the gate is `functions: ≥99%` and source has 1500 functions, the suite **cannot** have fewer than ~1485 tests unless you write integration tests that each cover multiple functions. The proportionality target is then mathematically unreachable without one of:

- **Lowering the gate** to a number compatible with the target (e.g., functions ≥85%)
- **Excluding more files** from coverage measurement (generated types, DTO files, constants, migration scripts)
- **Writing integration tests aggressively** so each test covers many functions

See [lookup-tables.md](lookup-tables.md#coverage-exclusion-patterns) for coverage exclusion patterns that avoid lowering the threshold.

**If incompatible, STOP and surface the conflict explicitly to the user before pruning:**

```
COVERAGE/TARGET CONFLICT

Project gate:        functions ≥99% over <path>
Functions in scope:  1480
Implied min tests:   ~1480 (1 per function) or ~150 with 10x integration coverage
Proportionality:     40–150

The current gate makes the proportionality target unreachable through deletion alone.
Choose one before continuing:

  A) Exclude generated/logic-free files from coverage scope (preferred)
  B) Lower the gate to <X>% (writes a recommended config patch)
  C) Commit to writing integration tests during this pass
  D) Accept higher count; cap deletion at obvious waste only

Default if no answer: A (add exclusions), then continue against the updated gate.
```

Do not start deletion until this is resolved.
