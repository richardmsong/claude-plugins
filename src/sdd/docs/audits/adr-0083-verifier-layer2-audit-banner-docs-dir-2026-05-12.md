# ADR-0083 Verifier Layer-2 Audit — `methodology.dashboard.banner_shows_resolved_docs_dir`

**Invariant**: `methodology.dashboard.banner_shows_resolved_docs_dir`
**Verifier**: `src/sdd/docs-dashboard/tests/server-banner.test.ts`
**ADR**: `src/sdd/docs/adr-0083-dashboard-respects-configured-adr-dir.md`
**Audit date**: 2026-05-12
**Auditor**: invariant-testing-evaluator
**Audit type**: Layer-2 (verifier roundtrip — test code faithfulness to registered definition)

---

## Registered Definition (from registry.yaml and ADR-0083 `### Added` block)

> The dashboard's startup banner includes a line of the form `Docs dir: <resolved-path>` where `<resolved-path>` is the same `docsDir` value `boot()` passes to `startWatcher`.

---

## Test Case Under Review

File: `src/sdd/docs-dashboard/tests/server-banner.test.ts`, lines 156–167 (last case in the `describe("buildStartupBanner", ...)` block).

```typescript
// Contract: methodology.dashboard.banner_shows_resolved_docs_dir (ADR-0083).
// Pre-declares the post-implementation signature:
//   buildStartupBanner(port: number, docsDir: string, ifaces?: ...)
// The @ts-expect-error below will be removed once buildStartupBanner is extended
// per ADR-0083 and the second parameter becomes docsDir: string (not ifaces).
it("includes a Docs dir line showing the resolved docs directory", () => {
  // @ts-expect-error — test pre-declares the post-implementation signature;
  // will be removed once buildStartupBanner is extended per ADR-0083
  const banner = buildStartupBanner(4567, "/tmp/some/docs/dir");
  expect(banner).toContain("Docs dir: /tmp/some/docs/dir");
  expect(banner).toContain("http://127.0.0.1:4567/");
});
```

---

## Reconstructed Invariant (from test code alone)

Reading only the test case above, the contract encoded is:

> `buildStartupBanner`, when called with a port and a `docsDir` string, produces a banner string that (a) contains a substring of the form `Docs dir: <docsDir>` and (b) contains the loopback URL `http://127.0.0.1:<port>/`.

### Assertion breakdown

| Assertion | Line | What it encodes |
|-----------|------|-----------------|
| `expect(banner).toContain("Docs dir: /tmp/some/docs/dir")` | 165 | A `Docs dir: <resolved-path>` line is present in the banner, using the exact string passed as the second argument |
| `expect(banner).toContain("http://127.0.0.1:4567/")` | 166 | The loopback line is still present alongside the docs-dir line |

The `@ts-expect-error` annotation at line 162–163 is structurally correct for this pre-implementation state: the current production signature of `buildStartupBanner` takes `(port: number, ifaces: ...)` with `ifaces` as the second parameter, not `docsDir: string`. The annotation pre-declares the post-ADR-0083 signature and will become a compile error (removable) once the implementation is extended.

---

## Diff: Reconstructed vs. Registered Definition

### Exact matches

**Clause 1 — `Docs dir: <resolved-path>` line present**

The registered definition requires "a line of the form `Docs dir: <resolved-path>`". The test asserts `toContain("Docs dir: /tmp/some/docs/dir")`. The `.toContain()` form is the correct assertion for checking that a line exists within a multi-line banner string. The label `Docs dir:` and the path value are both verified. Match is complete.

**Clause 2 — `<resolved-path>` equals the `docsDir` argument**

The registered definition requires `<resolved-path>` to be the same value `boot()` passes to `startWatcher`. The test passes `"/tmp/some/docs/dir"` as the `docsDir` argument to `buildStartupBanner` and asserts the banner contains that exact string in the `Docs dir:` line. This confirms `buildStartupBanner` echoes its own `docsDir` parameter verbatim — the correct unit-level operationalization of the full pipeline property. The `boot()`-to-`startWatcher` linkage (that the value in `buildStartupBanner` originates from `boot()`) is not the responsibility of this verifier; it is established by the complementary `methodology.dashboard.respects_configured_paths` verifier. No gap.

**Clause 3 — Loopback line remains present**

The registered definition does not explicitly require the loopback line to coexist with the docs-dir line, but the test asserts `toContain("http://127.0.0.1:4567/")`. This is a conservative correctness guard confirming the docs-dir addition does not displace the loopback URL. It is additive, not contradictory.

### Reconstructed clauses not in registered definition

**Delta 1 — Explicit loopback co-presence assertion**

The registered definition says the banner includes "a line of the form `Docs dir: <resolved-path>`" but is silent on whether the loopback line must survive alongside it. The test adds an explicit assertion that the loopback URL is still present. This is a strengthening addition, not a contradiction.

Assessment: The addition is sound. The existing test cases for `buildStartupBanner` establish the loopback line as a baseline behavior; the new test case verifying it persists when `docsDir` is added is consistent with the overall test suite's design intent. No drift.

### Clauses in registered definition not in test

None. All semantically load-bearing clauses of the registered definition (`Docs dir:` prefix, path echoed verbatim, co-presence with loopback) are covered.

---

## Verdict

**CLEAN.**

The test case at lines 161–167 of `server-banner.test.ts` faithfully encodes the contract stated in the registered definition of `methodology.dashboard.banner_shows_resolved_docs_dir`. Every clause in the definition maps to a direct assertion. The `@ts-expect-error` annotation is correctly placed and correctly scoped — it is the expected pre-implementation mechanism for this invariant type, and it will become removable (not silently wrong) once `buildStartupBanner` is extended. The one additive assertion (loopback co-presence) is a strengthening of the contract, not a deviation from it.

No contradictions. No missing clauses. No phantom assertions that encode a contract different from the registered definition.

The test is expected to fail today because `buildStartupBanner` does not yet accept a `docsDir` second parameter. That is the correct pre-implementation red state and is not relevant to the faithfulness evaluation.

---

## Coverage Checklist

| Registered definition clause | Covered by test? | Assertion |
|------------------------------|-----------------|-----------|
| Banner contains `Docs dir: <resolved-path>` line | Yes | `toContain("Docs dir: /tmp/some/docs/dir")` |
| `<resolved-path>` equals the `docsDir` value | Yes | Same string passed in and asserted in banner |
| Loopback line present (implied co-presence) | Yes | `toContain("http://127.0.0.1:4567/")` |

All clauses covered. Coverage is complete.
