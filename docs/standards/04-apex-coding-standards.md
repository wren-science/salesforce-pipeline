# 04 · Apex Coding Standards

Baseline rules for every Apex class and trigger. Reviewers and agents apply these to every PR. Design-level guidance (interfaces, abstraction, layering) is in [05](05-apex-design-patterns.md).

## 1. Governor limits reference

Per transaction, synchronous / asynchronous. Check the current Apex Developer Guide when designing near a limit.

| Limit | Sync | Async |
| --- | --- | --- |
| SOQL queries | 100 | 200 |
| Rows returned by SOQL | 50,000 | 50,000 |
| DML statements | 150 | 150 |
| Rows processed by DML | 10,000 | 10,000 |
| CPU time | 10 s | 60 s |
| Heap | 6 MB | 12 MB |
| Callouts | 100 | 100 |
| Cumulative callout timeout | 120 s | 120 s |
| `System.enqueueJob` | 50 | 1 (in a Queueable; more with `AsyncOptions` depth control) |
| `@future` calls | 50 | 0 in future/batch |
| Email invocations (`sendEmail`) | 10 | 10 |
| SOSL queries | 20 | 20 |
| Published immediate platform events | 150 (counted as DML) | 150 |

A trigger chunk is 200 records. A single DML of 10,000 records runs our trigger 50 times in one transaction, sharing the same limits.

## 2. Bulkification and limits

| ID | Rule |
| --- | --- |
| APX-01 | Every method that processes records MUST accept collections (`List`, `Set`, `Map`) and handle 1 to 10,000 records. Single-record public methods are thin wrappers over the bulk method. |
| APX-02 | SOQL MUST NOT appear inside a loop, including loops in called methods. |
| APX-03 | DML MUST NOT appear inside a loop. Collect records and perform one DML per object type. |
| APX-04 | Queries MUST select only the fields used. `FIELDS(ALL)` and dynamic "select every field" helpers are prohibited in production code. |
| APX-05 | Queries on objects with more than 100k rows MUST be selective ([10 §3](10-large-data-volumes.md#3-query-selectivity)). |
| APX-06 | Use `Map<Id, SObject>` built from a query (`new Map<Id, Account>([SELECT ...])`) for lookups. Avoid nested loops over two record lists (O(n²) CPU). |
| APX-07 | Use SOQL for-loops (`for (Account a : [SELECT ...])`) when a query may return more than a few thousand rows, to reduce heap. |
| APX-08 | Aggregate in SOQL (`COUNT`, `SUM`, `GROUP BY`) where possible. Do not query rows to count them in Apex. |
| APX-09 | Code that can approach a limit MUST check `Limits.*` and degrade safely: defer to async, chunk, or fail with a clear error. |
| APX-10 | Describe calls SHOULD be cached. Use `Schema.SObjectType.Account.fields.Name` tokens over `Schema.getGlobalDescribe()` (slow, heap heavy). |
| APX-11 | String building in loops MUST use `List<String>` + `String.join()`. |
| APX-12 | Relationship subqueries SHOULD be used over separate queries where the child volume per parent is bounded. Child rows over 200 per parent need `queryMore` handling or a separate query. |

```apex
// ❌ APX-02, APX-03
for (Case c : cases) {
  Contact ct = [SELECT Id, Student_Id__c FROM Contact WHERE Id = :c.ContactId];
  c.Student_Id__c = ct.Student_Id__c;
  update c;
}

// ✅
Set<Id> contactIds = new Set<Id>();
for (Case c : cases) {
  if (c.ContactId != null) contactIds.add(c.ContactId);
}
Map<Id, Contact> contacts = new Map<Id, Contact>(
  [SELECT Id, Student_Id__c FROM Contact WHERE Id IN :contactIds WITH USER_MODE]
);
for (Case c : cases) {
  Contact ct = contacts.get(c.ContactId);
  c.Student_Id__c = ct?.Student_Id__c;
}
// before-context: no DML needed; otherwise one update outside the loop
```

## 3. Security

| ID | Rule |
| --- | --- |
| APX-20 | Every class MUST declare a sharing keyword. Default `with sharing`. `inherited sharing` for utilities and selectors called from many contexts. `without sharing` requires a class comment explaining why and an ADR when it touches personal data. |
| APX-21 | Queries MUST enforce CRUD/FLS for user-initiated paths: `WITH USER_MODE` in SOQL, `AccessLevel.USER_MODE` for `Database` methods and dynamic SOQL. |
| APX-22 | System-mode operations (`WITH SYSTEM_MODE`, `AccessLevel.SYSTEM_MODE`) MUST be explicit and commented. Typical cases: TAF actions maintaining derived fields, integration processing, purge jobs. |
| APX-23 | DML for user-initiated paths MUST use user mode: `insert as user records;` or `Database.insert(records, AccessLevel.USER_MODE)`. |
| APX-24 | `WITH SECURITY_ENFORCED` and `Security.stripInaccessible` SHOULD NOT be used in new code. Use user mode. `stripInaccessible` remains acceptable when partial field access must be tolerated. |
| APX-25 | Dynamic SOQL MUST use bind variables (`Database.queryWithBinds`) or `String.escapeSingleQuotes`. Field and object names from input MUST be validated against describe results. |
| APX-26 | Secrets, tokens, passwords and endpoints MUST NOT appear in code, custom labels or debug output. Use Named Credentials ([11](11-integration-and-external-client-apps.md)). |
| APX-27 | Personal data MUST NOT be written to logs, exception messages or `System.debug` ([07 §5](07-logging-and-error-handling.md#5-personal-data-in-logs)). |
| APX-28 | `@AuraEnabled` and `@RestResource` methods are public entry points. They MUST validate inputs, enforce user mode, and return sanitised errors. |
| APX-29 | `global` access modifier MUST NOT be used outside managed-package-style APIs and TAF-required types. |

```apex
// Static SOQL, user mode
List<Case> cases = [
  SELECT Id, Status FROM Case WHERE Id IN :caseIds WITH USER_MODE
];

// Dynamic SOQL with binds, user mode
Map<String, Object> binds = new Map<String, Object>{ 'status' => status };
List<Case> result = Database.queryWithBinds(
  'SELECT Id FROM Case WHERE Status = :status LIMIT 200',
  binds,
  AccessLevel.USER_MODE
);

// DML in user mode, partial success
Database.SaveResult[] results = Database.update(records, false, AccessLevel.USER_MODE);
```

## 4. Exceptions and errors

| ID | Rule |
| --- | --- |
| APX-30 | Exceptions MUST NOT be swallowed. Every `catch` either rethrows, converts to a domain exception, adds an error to the record, or logs through Nebula Logger with the exception attached. Empty catch blocks are prohibited. |
| APX-31 | Catch specific exception types (`DmlException`, `QueryException`, `CalloutException`). `catch (Exception e)` is acceptable only at entry points, where it logs and rethrows or returns a controlled error. |
| APX-32 | Custom exceptions are named `<Domain>Exception` and extend `Exception`. One exception class per domain. |
| APX-33 | User-facing validation errors from triggers use `record.addError(fieldOrMessage)` and Custom Labels. |
| APX-34 | Partial-success DML (`allOrNone = false`) MUST inspect every `SaveResult`/`DeleteResult`/`UpsertResult` and log or surface failures. |
| APX-35 | `@AuraEnabled` methods throw `AuraHandledException` with a safe message. The original exception is logged first. |
| APX-36 | Use `Database.setSavepoint()` / `rollback()` around multi-step DML in a single unit of work when partial completion leaves data inconsistent. Savepoints count against DML limits. |

```apex
@AuraEnabled
public static void submitApplication(Id applicationId) {
  try {
    new ApplicationService().submit(new Set<Id>{ applicationId });
  } catch (ApplicationException e) {
    Logger.warn('Application submit rejected', applicationId, e);
    Logger.saveLog();
    throw new AuraHandledException(e.getMessage()); // domain message, safe to show
  } catch (Exception e) {
    Logger.error('Application submit failed', applicationId, e);
    Logger.saveLog();
    throw new AuraHandledException(System.Label.Generic_Error_Message);
  }
}
```

## 5. Language and style

| ID | Rule |
| --- | --- |
| APX-40 | Classes and triggers use the current API version (within 3 releases). PRs MUST NOT lower API versions. |
| APX-41 | One top-level class per responsibility. Classes over ~500 lines or methods over ~50 lines SHOULD be split. Cyclomatic complexity per method SHOULD stay under 10 (PMD `CognitiveComplexity`, `CyclomaticComplexity`). |
| APX-42 | Names: classes `PascalCase`, methods and variables `camelCase`, constants `UPPER_SNAKE_CASE`. Names describe intent, e.g. `activeEnrolments`. |
| APX-43 | Public and global methods have ApexDoc (`/** ... */`) stating purpose, params, return and thrown exceptions. Comments explain *why*. |
| APX-44 | Use the null-safe operators `?.` and `??` over nested null checks. |
| APX-45 | Use `Assert` class methods in tests (`Assert.areEqual`, `Assert.isTrue`), never `System.assert` in new code. |
| APX-46 | `System.debug` MUST NOT be committed. Use Nebula Logger. |
| APX-47 | Magic numbers and strings are constants, custom metadata or Custom Labels, placed according to [§9](04-apex-coding-standards.md#9-constants). |
| APX-48 | Hard-coded Ids, usernames, org URLs and record type Ids are prohibited. Resolve record types by DeveloperName with `RecordTypes.idFor(Case.SObjectType, CaseConstants.RT_WEBFORM_ENQUIRY)` ([§9](04-apex-coding-standards.md#9-constants)). |
| APX-49 | `@future` MUST NOT be used in new code. Use Queueable ([12](12-asynchronous-processing.md)). |
| APX-50 | `@TestVisible` is allowed on private members for injection seams. Test-only branches (`if (Test.isRunningTest())`) are prohibited. |
| APX-51 | Use `switch on` for multi-branch type or enum logic. Use enums over string constants for closed sets. |
| APX-52 | Prefer immutable inputs: methods SHOULD NOT mutate collections passed in, except TAF before-context actions that set fields by design. |
| APX-53 | Formatting is enforced by Prettier with `prettier-plugin-apex` in pre-commit ([15](15-quality-gates.md)). |

## 6. SOQL and DML details

-   **Selectors own queries** ([05 §4](05-apex-design-patterns.md#4-selector-layer)). Services do not contain inline SOQL for shared objects.
-   **`LIMIT`** every query that is not keyed by an Id set or that feeds UI.
-   **Order by an indexed field** when paging. Offset paging (`OFFSET`) is limited to 2,000 rows. Use keyset paging (`WHERE Id > :lastId ORDER BY Id`) or cursors for more.
-   **Negative operators** (`!=`, `NOT IN`, `NOT LIKE`) and leading wildcards (`LIKE '%x'`) are non-selective. Avoid them on large objects.
-   **Formula fields in filters** are non-selective unless deterministic and indexed. Avoid.
-   **Upsert** on an External Id field for integration loads. The external Id field is unique and indexed.
-   **Mixed DML**: setup objects (User, Group, GroupMember, PermissionSetAssignment) and non-setup objects cannot be changed in the same transaction. Move setup DML to a Queueable.
-   **Lock contention**: when updating many children of one parent, order by parent Id and keep transactions short. Use `FOR UPDATE` only where a read-modify-write race is real.

## 7. Callouts

-   Callouts go through Named Credentials: `req.setEndpoint('callout:StudentSystem_API/v1/students');`.
-   Every callout sets an explicit timeout (`req.setTimeout(...)`) below the remaining cumulative timeout.
-   Callouts cannot follow uncommitted DML in the same transaction. Do callouts first, or move them to a Queueable with `Database.AllowsCallouts`.
-   Callout classes implement an interface so they can be mocked ([05 §3](05-apex-design-patterns.md#3-interfaces-and-dependency-injection), [06 §4](06-testing-and-mocking.md#4-mocking)).
-   Response parsing uses typed wrapper classes with `JSON.deserialize`. Untyped `Map<String, Object>` parsing is acceptable only for small, dynamic payloads.
-   Retries are bounded (max 3, exponential back-off via Queueable delay) and idempotent ([12 §6](12-asynchronous-processing.md#6-error-handling-retries-and-idempotency)).

## 8. Performance tips

| Topic | Guidance |
| --- | --- |
| CPU | Avoid repeated describe calls, JSON serialisation of large objects and regex in loops. Measure with `Limits.getCpuTime()` in tests near limits. |
| Heap | Null out large collections after use in long methods. Use SOQL for-loops. Query only needed fields. |
| Platform Cache | Cache reference data read on most transactions (`Cache.Org`). Always handle cache misses. |
| Static caching | Per-transaction static maps for repeated lookups (selectors, custom metadata). |
| Async | Move non-critical work out of the user's transaction ([12](12-asynchronous-processing.md)). |

## 9. Constants

Constants are split by owner and by kind. One org-wide constants class is prohibited: every class would depend on it, so it becomes a merge-conflict hotspot across value streams, any edit invalidates and recompiles every dependent class, and it grows into a dumping ground with no owner.

| ID | Rule |
| --- | --- |
| APX-54 | A global "catch-all" constants class (`Constants`, `AppConstants`, `Utils`) MUST NOT be created. Constants live in the class for their kind and owner (table below). |
| APX-55 | Constants are `public static final`, named `UPPER_SNAKE_CASE`, with a prefix for the field or group they belong to (`STATUS_CLOSED`, `RT_WEBFORM_ENQUIRY`). Constants classes contain no logic, no SOQL and no describe calls in static initialisers. |
| APX-56 | Values that change over time or differ by environment MUST NOT be constants. They go in custom metadata (DES-04). |
| APX-57 | Field and object API names MUST NOT be held as string constants. Use Schema tokens (`Case.Status`, `Schema.SObjectType.Case`). |
| APX-58 | Every `<Object>Constants` class that holds picklist values MUST have a test asserting each value exists in the field's describe (`getPicklistValues()`), so a picklist change that breaks code fails the build. |
| APX-59 | Text shown to users MUST be a Custom Label, never a constant (UI-04). |

| Kind of value | Home | Example |
| --- | --- | --- |
| Picklist values used in logic | `<Object>Constants`, one per object, owned by the object's owning team | `CaseConstants.STATUS_CLOSED` |
| Record type developer names | Same `<Object>Constants` class. Ids are resolved at runtime by the shared `RecordTypes` utility, which caches describe results. | `RecordTypes.idFor(Case.SObjectType, CaseConstants.RT_WEBFORM_ENQUIRY)` |
| Custom permission API names | `Permissions`, one small platform class | `FeatureManagement.checkPermission(Permissions.BYPASS_TRIGGERS)` |
| Platform-wide technical values (Nebula tags and scenario prefixes, async limits used by shared utilities) | `PlatformConstants`, owned by the Platform team | `PlatformConstants.TAG_PURGE` |
| Value-stream-specific values that are fixed by design | `<Domain>Constants` in that value stream's code | `AdmissionsConstants.MAX_PREFERENCES` |
| A closed set used only inside code (states, modes, result types) | `enum` | `enum SyncOutcome { SENT, SKIPPED, FAILED }` |
| Thresholds, mappings, endpoints, switches | Custom metadata (APX-56) | `Integration_Setting__mdt.getInstance('StudentSystem').Batch_Size__c` |
| User-facing messages | Custom Labels (APX-59) | `System.Label.Enquiry_Closed_Error` |

Apex inner classes cannot declare static members, so constants are grouped by name prefix within one top-level class.

```apex
/** Case values referenced in code. Owner: <owning team>. Picklists are restricted (DM-08). */
public inherited sharing class CaseConstants {
  // Status
  public static final String STATUS_NEW = 'New';
  public static final String STATUS_CLOSED = 'Closed';
  // Record types (DeveloperName)
  public static final String RT_WEBFORM_ENQUIRY = 'Webform_Enquiry';
  public static final String RT_EMAIL_ENQUIRY = 'Email_Enquiry';
}
```

```apex
/** Resolves record type Ids by DeveloperName, with per-transaction caching. */
public inherited sharing class RecordTypes {
  private static final Map<Schema.SObjectType, Map<String, Schema.RecordTypeInfo>> CACHE =
    new Map<Schema.SObjectType, Map<String, Schema.RecordTypeInfo>>();

  public static Id idFor(Schema.SObjectType objectType, String developerName) {
    if (!CACHE.containsKey(objectType)) {
      CACHE.put(objectType, objectType.getDescribe(Schema.SObjectDescribeOptions.DEFERRED).getRecordTypeInfosByDeveloperName());
    }
    Schema.RecordTypeInfo info = CACHE.get(objectType).get(developerName);
    if (info == null) {
      throw new IllegalArgumentException('Unknown record type ' + developerName + ' on ' + objectType);
    }
    return info.getRecordTypeId();
  }
}
```

Picklist guard test (APX-58), run as the minimum-access persona (TST-16):

```apex
@IsTest
private class CaseConstantsTest {
  @IsTest
  static void statusConstantsExistInPicklist() {
    System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
      Set<String> values = new Set<String>();
      for (Schema.PicklistEntry e : Case.Status.getDescribe().getPicklistValues()) {
        values.add(e.getValue());
      }
      for (String c : new List<String>{ CaseConstants.STATUS_NEW, CaseConstants.STATUS_CLOSED }) {
        Assert.isTrue(values.contains(c), 'Case.Status is missing constant value ' + c);
      }
    }
  }
}
```
