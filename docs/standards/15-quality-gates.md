# 15 · Quality Gates

Source control, branching, environments and deployment are defined in the DevOps / Application Lifecycle Management documentation: **\[ALM-LINK\]**. This document defines only the quality gates a change must pass on its way through that lifecycle, and the thresholds that block it.

## 1. Rules

| ID | Rule |
| --- | --- |
| QG-01 | Every change reaches production through a PR approved by a Tech Lead (or delegated reviewer) using [16 · Code review checklist](16-code-review-checklist.md), with every blocking gate in §2 passed. |
| QG-02 | The PR description states: story, personas affected (DES-01), ADRs, rule deviations with reasons, test evidence. A PR without persona impact on a functional change fails review. |
| QG-03 | **Salesforce Code Analyzer v5** (`sf code-analyzer run`) runs on every PR with the PMD, ESLint, Flow Scanner, Regex and CPD engines. Severity 1–2 violations block the merge. |
| QG-04 | Apex tests run on every PR in a validation deployment (`RunLocalTests`, or `RunSpecifiedTests` for agreed fast-path PRs). All tests pass. Coverage per new or changed class ≥ 85%, org-wide ≥ 80% (TST-02). |
| QG-05 | Jest tests run on every PR for changed LWC and all pass (TST-14). |
| QG-06 | Prettier (`prettier-plugin-apex`) and ESLint run in pre-commit hooks (APX-53). |
| QG-07 | A metadata check on every PR fails when a new or changed object or field lacks a description, help text (user-facing fields) or data classification (DM-03), or when a new object has no `Data_Retention_Policy__mdt` row (RET-01). |
| QG-08 | A secret scan on every PR fails on credentials, private keys, consumer secrets or ECA global OAuth settings in the diff (APX-26, INT-10). |
| QG-09 | Destructive changes are in their own PR with an ADR and a confirmed data backup (DES-11). |
| QG-10 | Production release requires UAT sign-off as each affected persona. |

## 2. Gate summary

| Stage | Gate | Tool / evidence | Threshold | Blocking |
| --- | --- | --- | --- | --- |
| Pre-commit | Formatting, LWC lint | Prettier, ESLint (husky + lint-staged) | No errors | Yes (local) |
| PR | Static analysis | Code Analyzer v5 | No severity 1–2 | Yes |
| PR | Apex tests and coverage | Validation deployment | 100% pass; ≥ 85% per changed class; ≥ 80% org | Yes |
| PR | Persona tests | Code review | Every test uses `System.runAs` with a `TestPersonaFactory` user (TST-16) | Yes |
| PR | LWC tests | `sfdx-lwc-jest` | 100% pass | Yes |
| PR | Metadata completeness | Metadata check script | QG-07 | Yes |
| PR | Secrets | Secret scanner | None found | Yes |
| PR | Code review | [16 · Checklist](16-code-review-checklist.md) | No open **B** findings | Yes |
| PR | ADRs | PR description | Linked and approved for every ADR trigger ([01 §4](01-design-principles.md#4-justification-and-architecture-decision-records)) | Yes |
| PR | LDV assessment | PR description / design | Present when Tier 1/2 objects are touched (LDV-01) | Yes |
| Pre-production | UAT persona sign-off | UAT evidence | Each affected persona signed off | Yes |

## 3. Code Analyzer configuration

`code-analyzer.yml` at repo root sets rule severities. Minimum PMD rules enforced at severity ≤ 2:

| Category | Rules |
| --- | --- |
| Performance | `OperationWithLimitsInLoop` (SOQL/DML in loops), `AvoidDebugStatements`, `EagerlyLoadedDescribeSObjectResult` |
| Security | `ApexSharingViolations`, `ApexCRUDViolation`, `ApexSOQLInjection`, `ApexBadCrypto`, `ApexSuggestUsingNamedCred`, `ApexInsecureEndpoint`, `ApexXSSFromURLParam`, `ApexOpenRedirect` |
| Error prone | `EmptyCatchBlock`, `AvoidHardcodingId`, `AvoidNonExistentAnnotations` |
| Best practice | `ApexUnitTestClassShouldHaveAsserts`, `ApexUnitTestShouldNotUseSeeAllDataTrue`, `AvoidGlobalModifier`, `AvoidLogicInTrigger`, `ApexAssertionsShouldIncludeMessage` |
| Design | `CognitiveComplexity`, `CyclomaticComplexity`, `ExcessiveParameterList`, `NcssMethodCount` |
| Code style | `ClassNamingConventions`, `MethodNamingConventions`, `FieldNamingConventions` |

Custom regex rules:

-   `System\.debug\(` in non-test classes (APX-46)
-   `@future` (APX-49)
-   `Test\.isRunningTest\(\)` in non-test classes (APX-50)
-   `WITH SECURITY_ENFORCED` (APX-24)
-   Literal 15/18-character Id patterns (APX-48)

Flow Scanner rules enforced: DML/Get Records in loops, missing fault paths, hard-coded Ids, missing descriptions, API version too old, record-triggered flow present (AUT-01).

## 4. Definition of Done

A story is done when:

-   [ ]  Persona impact documented and PSG / public group changes included (DES-01)
-   [ ]  ADRs approved for any MUST deviations or ADR triggers ([01 §4](01-design-principles.md#4-justification-and-architecture-decision-records))
-   [ ]  Code meets [16 · Code review checklist](16-code-review-checklist.md); reviewer approved
-   [ ]  Code Analyzer: no severity 1–2 violations
-   [ ]  Apex tests pass; changed classes ≥ 85% with assertions; bulk and negative tests present
-   [ ]  Every test runs the code under test as a persona via `System.runAs` (TST-16); `TestPersonas` updated for new or changed personas
-   [ ]  Jest tests pass for changed LWC
-   [ ]  New objects/fields have descriptions, help text, classification (DM-03)
-   [ ]  Retention policy row added for new objects (RET-01)
-   [ ]  LDV assessment included where Tier 1/2 objects are touched (LDV-01)
-   [ ]  Logging in place with scenario and tags (LOG-02/04)
-   [ ]  Tested in UAT as each affected persona
-   [ ]  Persona Catalogue updated if capability or visibility changed
