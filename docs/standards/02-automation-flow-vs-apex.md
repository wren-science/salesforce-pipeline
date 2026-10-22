# 02 · Automation: Flow vs Apex

Based on the Salesforce Architects *Record-Triggered Automation* decision guide, adjusted for our policy of a single trigger framework.

## 1. Rules

| ID | Rule |
| --- | --- |
| AUT-01 | Record-triggered flows (before-save, after-save, scheduled paths, async paths) MUST NOT be created on any object. |
| AUT-02 | Process Builder and Workflow Rules MUST NOT be created. Existing ones are migrated to TAF when touched. |
| AUT-03 | All record-triggered logic MUST run as a TAF action ([03](03-trigger-actions-framework.md)). The default action type is Apex. |
| AUT-04 | A Flow invoked as a TAF action (`Trigger_Action__mdt.Flow_Name__c`) MAY be used only with an approved ADR (§4). |
| AUT-05 | Platform-event-triggered flows MUST NOT be used for system integration processing. Use Apex platform event triggers through TAF. |
| AUT-06 | Schedule-triggered flows SHOULD NOT be used. Scheduled work runs through the scheduler registry ([12 §5](12-asynchronous-processing.md#5-scheduled-jobs)). |
| AUT-07 | Screen flows are the default for guided user processes. Complex logic, heavy queries and callouts in a screen flow go into Apex invocables. |
| AUT-08 | Autolaunched flows MAY be used as subflows of screen flows, and as admin-maintainable logic invoked from Apex, within the limits in §3. |
| AUT-09 | Every flow MUST have a description, a fault path on every DML, Get Records with possible failure, and action element, and the fault path MUST log through the Nebula Logger flow action. |
| AUT-10 | Flows MUST NOT contain DML or Get Records elements inside loops. |
| AUT-11 | Flows MUST NOT hard-code record Ids. Use custom metadata, custom labels or Get Records by developer name. |

## 2. Decision matrix

| Requirement | Screen Flow | Autolaunched Flow (subflow / called from Apex) | TAF Apex action | TAF Flow action | Queueable / Batch Apex |
| --- | --- | --- | --- | --- | --- |
| Guided user input, wizard | ✅ Default | ✅ as subflow | ❌ | ❌ | ❌ |
| Same-record field update on save | ❌ | ❌ | ✅ Default (before context) | ⚠️ ADR | ❌ |
| Related-record create/update on save | ❌ | ❌ | ✅ Default | ⚠️ ADR | ✅ when deferrable |
| Validation needing queries or cross-object data | ❌ | ❌ | ✅ (`addError`) | ⚠️ ADR | ❌ |
| Simple validation on the record itself | Validation rule |  |  |  |  |
| Callout | ✅ via Apex invocable | ⚠️ via Apex invocable | ✅ by enqueueing async | ❌ | ✅ Default |
| \> 10k records in one operation | ❌ | ❌ | ⚠️ must be bulk-safe | ❌ | ✅ Default |
| Complex branching, maps, sets, collections | ⚠️ | ⚠️ | ✅ | ❌ | ✅ |
| Logic owned and changed by admins, low volume, low complexity | ✅ | ✅ | ❌ | ⚠️ ADR | ❌ |
| Needs unit tests with mocks | ❌ | ❌ | ✅ | ⚠️ limited | ✅ |
| Sharing recalculation, Apex managed sharing | ❌ | ❌ | ✅ | ❌ | ✅ |
| Approval routing | Approval processes or Flow Orchestration |  |  |  |  |

✅ preferred · ⚠️ allowed with conditions · ❌ not allowed

## 3. Why Apex is the default for record-triggered logic

The trade-off as it applies to our platform:

| Factor | Apex (TAF) | Flow |
| --- | --- | --- |
| Ordering | Explicit `Order__c` in one place | Trigger Order field per flow, mixed with Apex triggers in undefined order outside TAF |
| Bulk behaviour | Developer controls collections and queries | Engine bulkifies some elements. Loops with Get Records/DML fail at volume. |
| Testability | Unit tests with mocks and DML-less tests | Flow tests are limited. Apex tests needed to cover TAF flow actions. |
| Debugging | Nebula Logger, debug logs, stack traces | Fault emails, flow interview logs |
| Code review | Diff-able, static analysis (PMD), agent reviewable | XML diffs are hard to review. Flow scanner covers part of it. |
| CPU | Lower per record | Higher per element at volume |
| Change by admins | Requires a developer | Admin-editable |

## 4. TAF Flow action justification

An ADR for a TAF Flow action MUST show all of the following:

1.  The logic is owned by a business or admin team who will maintain it, and the owner is named.
2.  Expected volume per transaction is under 200 records and the object is not in the LDV list ([10 §2](10-large-data-volumes.md#2-our-volumes)).
3.  The flow performs no callouts and no DML in loops, and touches at most one related object.
4.  An Apex test exercises the flow through real DML on the object.
5.  The flow has fault paths that log through Nebula Logger.
6.  `Allow_Flow_Recursion__c` is false unless the ADR states why recursion is safe.

Flow action contract (TAF):

| Flow variable | Type | Direction | Contexts |
| --- | --- | --- | --- |
| `record` | Record (the object) | Input and output | All. Changes in before contexts are applied to the record. |
| `recordPrior` | Record (the object) | Input | Update, delete |

The flow MUST be an autolaunched flow with no trigger. Use `TriggerActionFlowAddError` (invocable `addError`) to add errors to the triggering record.

## 5. Flow standards (where Flow is allowed)

-   One purpose per flow. Use subflows for reuse.
-   Entry conditions and decisions use custom metadata or custom permissions for switches. Hard-coded profile names are prohibited.
-   Get Records retrieves only the fields needed ("Choose fields and let Salesforce do the rest" is not allowed for objects with more than 50 fields).
-   Screen flows that read or write personal data run in **user context** (`Run Flow as: User`). *System context without sharing* needs an ADR.
-   Every flow version is saved with a description of the change. Inactive versions older than the last 3 are deleted during release housekeeping.
-   Flow API version is kept within 3 major releases of current.
-   Flows are scanned by the Code Analyzer flow engine in CI ([15](15-quality-gates.md)).
