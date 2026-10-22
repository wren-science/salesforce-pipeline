# 16 · Code Review Checklist

Used by Tech Leads and AI review agents on every PR. Each item links to the rule that defines it. **B** = blocking (MUST). **N** = non-blocking (SHOULD) unless the PR gives no reason.

## 1. Review procedure (agents and humans)

1.  Read the PR description. Confirm it names personas affected, ADRs and deviations (QG-02). Missing persona impact on a functional change is **B** (DES-01).
2.  Classify each changed file: Apex class, Apex test, trigger, TAF metadata, flow, LWC, object/field, permission set/PSG, sharing rule, ECA/Named Credential, custom metadata, other.
3.  Apply the sections below for each file type.
4.  Check cross-cutting items (§10).
5.  Report findings in this format, one per finding, most severe first:

```
[B|N] <RULE-ID> <path>:<line> — <what is wrong> → <what to change>
```

Example:

```
[B] APX-02 force-app/main/default/classes/CaseService.cls:84 — SOQL inside for loop over cases → collect ContactIds, query once into Map<Id, Contact>
[N] APX-43 force-app/main/default/classes/CaseService.cls:20 — public method without ApexDoc → add purpose, params, return
```

6.  Do not report style issues that Prettier or Code Analyzer already enforce, unless the pipeline did not run.

## 2. Triggers and TAF

| Sev | Check | Rule |
| --- | --- | --- |
| B | Trigger body is only `new MetadataTriggerHandler().run();`, all 7 events declared, one trigger per object | TAF-01 |
| B | New record-triggered flow, Process Builder or Workflow Rule | AUT-01, AUT-02 |
| B | `SObject_Trigger_Setting__mdt` row exists with `Bypass_Permission__c` | TAF-02 |
| B | Action class named `TA_<Object>_<Purpose>`, single responsibility | TAF-03 |
| B | Action processes only changed records (or uses entry criteria) | TAF-06 |
| B | No `Logger.saveLog()` in actions | TAF-07 |
| B | Flow action has an approved ADR | TAF-08, AUT-04 |
| B | Bypasses cleared in `finally` | TAF-09 |
| B | No DML on triggering records in after contexts; same-record updates in before | TAF-10 |
| B | No callouts in actions; async via `AsyncDispatcher` or finalizer | TAF-11, ASY-09 |
| B | DML-less unit test per action; integration test per object | TAF-12 |
| N | Business logic in a service, action is thin | TAF-04 |
| N | `Order__c` steps of 10; `Description__c` references story/ADR | TAF-05 |
| N | Recursion guarded with TAF counters, no static Boolean flags | §7 of [03](03-trigger-actions-framework.md) |
| N | Shared queries cached across actions | TAF-13 |

## 3. Apex classes

**Bulkification and limits**

| Sev | Check | Rule |
| --- | --- | --- |
| B | Methods accept collections and are safe for 200+ records | APX-01 |
| B | No SOQL in loops (including via called methods) | APX-02 |
| B | No DML in loops | APX-03 |
| B | No `FIELDS(ALL)` / select-all helpers | APX-04 |
| B | Selective queries on Tier 1/2 objects; plan evidence for new non-Id queries | APX-05, LDV-02 |
| N | Map-based lookups, no nested loops over record lists | APX-06 |
| N | SOQL for-loops for large result sets | APX-07 |
| N | Aggregates in SOQL | APX-08 |
| N | Limit checks where limits can be approached | APX-09 |
| N | Describe results cached / tokens used | APX-10 |

**Security**

| Sev | Check | Rule |
| --- | --- | --- |
| B | Sharing keyword declared; `without sharing` has a reason comment | APX-20 |
| B | User-initiated paths use `WITH USER_MODE` / `AccessLevel.USER_MODE` | APX-21, APX-23 |
| B | System mode is explicit and commented | APX-22 |
| B | Dynamic SOQL uses binds or escaping; dynamic names validated | APX-25 |
| B | No secrets, tokens, endpoints in code | APX-26, INT-11 |
| B | No personal data in logs, exceptions or debug | APX-27, LOG-07 |
| B | `@AuraEnabled` / `@RestResource` validate input, user mode, sanitised errors | APX-28 |
| B | No `global` outside approved cases | APX-29 |
| N | No `WITH SECURITY_ENFORCED` in new code | APX-24 |

**Errors and logging**

| Sev | Check | Rule |
| --- | --- | --- |
| B | No empty or swallowing catch blocks | APX-30 |
| B | Partial-success DML results inspected | APX-34 |
| B | Entry points log with exception and save once | LOG-02 |
| B | `AuraHandledException` with safe message after logging | APX-35 |
| N | Specific exception types caught below entry points | APX-31 |
| N | Scenario set at entry points; async jobs linked to parent transaction | LOG-04, LOG-05 |
| N | Record Id passed to log entries | LOG-06 |

**Style and language**

| Sev | Check | Rule |
| --- | --- | --- |
| B | No `System.debug` | APX-46 |
| B | No hard-coded Ids, usernames, URLs, record type Ids | APX-48, DES-04 |
| B | No `@future` | APX-49 |
| B | No `Test.isRunningTest()` branches | APX-50 |
| B | No branching on profile/role/user name; custom permissions used | DES-13 |
| B | API version not lowered and within 3 releases | APX-40 |
| N | Size and complexity within limits | APX-41 |
| N | ApexDoc on public methods | APX-43 |
| B | No catch-all constants class; constants placed by kind and owner | APX-54 |
| B | No API names held as string constants; Schema tokens used | APX-57 |
| B | Picklist constants guarded by a describe test | APX-58 |
| N | Constants / custom metadata / labels for magic values | APX-47, APX-55, APX-56 |
| N | Null-safe operators; `switch on`; enums for closed sets | APX-44, APX-51 |

**Design**

| Sev | Check | Rule |
| --- | --- | --- |
| B | Entry points contain no business logic | PAT-02 |
| B | Callouts behind a gateway interface | PAT-05 |
| B | No cross-value-stream dependency on concrete domain classes | PAT-10 |
| N | Shared logic in a service | PAT-03 |
| N | Queries in selectors for shared objects | PAT-04 |
| N | Dependencies injectable for tests | PAT-06 |
| N | Interface / abstract / virtual used per decision table | PAT-07 |
| N | Inheritance ≤ 2 levels; composition preferred | PAT-08 |
| N | Instance methods for services and selectors | PAT-09 |

## 4. Apex tests

| Sev | Check | Rule |
| --- | --- | --- |
| B | Every test method asserts outcomes with `Assert` | TST-01 |
| B | ≥ 85% coverage on changed classes | TST-02 |
| B | Positive, negative, bulk (≥ 200) and access-denial paths | TST-03 |
| B | Every test method runs the code under test inside `System.runAs` with a `TestPersonaFactory` user | TST-16 |
| B | Persona matches who runs the code in production; never System Administrator or the default test user | TST-17 |
| B | Persona users created in `@TestSetup`; no ad-hoc permission set assignments to test users | TST-18 |
| B | No `SeeAllData=true` | TST-04 |
| B | No dependency on org data or hard-coded Ids | TST-06 |
| B | Callouts mocked | TST-07 |
| B | Entry points tested as each persona that uses them, plus a denial test | TST-13 |
| N | Test data via factory | TST-05 |
| N | Collaborators mocked in unit tests | TST-08 |
| N | Descriptive method names | TST-12 |

## 5. Async

| Sev | Check | Rule |
| --- | --- | --- |
| B | Schedulable is a thin launcher, registered in `Scheduled_Job__mdt` | ASY-03, ASY-04 |
| B | Async jobs log, link parent transaction, save once | ASY-05 |
| B | Transient-failure Queueables attach a finalizer | ASY-06 |
| B | Job is idempotent | ASY-07 |
| B | Self-chaining Queueables set max stack depth | ASY-14 |
| N | Batch implements `Database.RaisesPlatformEvents` | ASY-10 |
| N | Minimal `Database.Stateful` | ASY-11 |
| N | Single-instance guard | ASY-13 |

## 6. Flows

| Sev | Check | Rule |
| --- | --- | --- |
| B | Not record-triggered; not schedule-triggered without ADR | AUT-01, AUT-06 |
| B | Fault paths on DML, Get Records and actions, logging to Nebula | AUT-09, LOG-09 |
| B | No DML / Get Records in loops | AUT-10 |
| B | No hard-coded Ids | AUT-11 |
| N | Description on flow and version | AUT-09 |
| N | Runs in user context, or ADR for system context without sharing | [02 §5](02-automation-flow-vs-apex.md#5-flow-standards-where-flow-is-allowed) |

## 7. LWC

| Sev | Check | Rule |
| --- | --- | --- |
| B | Apex controllers `with sharing`, user mode, DTOs | UI-02 |
| B | No profile-name checks | UI-06 |
| B | No `innerHTML` with untrusted data; no external CDN scripts | UI-07, UI-08 |
| B | Jest tests present | UI-11 |
| N | LDS before Apex | UI-01 |
| N | Labels via Custom Labels | UI-04 |
| N | Loading/empty/error states; errors logged | UI-05 |
| N | Accessibility (WCAG 2.2 AA) | UI-09 |
| N | Communication via `@api`, events, LMS | UI-12 |

## 8. Data model and metadata

| Sev | Check | Rule |
| --- | --- | --- |
| B | New custom object has an approved ADR | DM-01 |
| B | New field has justification in story | DM-02 |
| B | Description, help text, classification set | DM-03 |
| B | Retention policy row for new objects | DM-04, RET-01 |
| B | External Id on integration-keyed objects | DM-07 |
| B | No repurposed fields | DM-05 |
| N | Restricted picklists / global value sets | DM-08 |
| N | No formula fields used as filters on LDV objects | [09 §4](09-data-model.md#4-field-design) |

## 9. Access, sharing and integration

| Sev | Check | Rule |
| --- | --- | --- |
| B | Sharing grants target public groups only | SHR-03 |
| B | No catch-all sharing criteria | SHR-07 |
| B | OWD change has ADR | SHR-02 |
| B | Apex managed sharing uses a custom row cause and groups | SHR-09 |
| B | Sharing changes covered by persona visibility tests | SHR-15 |
| B | Permissions via PSG; no permission sets assigned directly to users in scripts | User Security Model Standard *(not in this repo: `reports/user-security-model-standard.md`)* |
| B | Inbound OAuth via ECA; no new Connected App | INT-02 |
| B | Integration user 1:1, Integration licence, API-only profile with IP ranges | INT-03, INT-04 |
| B | ECA: admin-approved users via permission set, IP restrictions enforced | INT-06, INT-07 |
| B | Permitted OAuth flow; minimal scopes | INT-08, INT-09 |
| B | No ECA global OAuth settings (keys, secrets, certs) in the repo | INT-10 |
| B | Outbound via Named + External Credentials, principal access via permission set | INT-11 |
| N | Integration logging with tag and correlation Id | INT-14 |

## 10. Cross-cutting

| Sev | Check | Rule |
| --- | --- | --- |
| B | Persona impact stated and PSG/public group changes included | DES-01 |
| B | Required ADRs linked | [01 §4](01-design-principles.md#4-justification-and-architecture-decision-records) |
| B | LDV assessment present when Tier 1/2 objects touched | LDV-01 |
| B | No changes to managed package components | DES-12 |
| B | Destructive changes isolated with ADR and backup | QG-09, DES-11 |
| N | Touched legacy code brought into line where in scope | DES-10 |
