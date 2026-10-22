# 07 · Logging and Error Handling (Nebula Logger)

[Nebula Logger](https://github.com/jongpie/NebulaLogger) (unlocked package, installed at v4.16) is the single logging framework for Apex, Flow, LWC and Aura. `System.debug`, custom log objects and error emails are retired for operational logging.

## 1. Rules

| ID | Rule |
| --- | --- |
| LOG-01 | All operational logging MUST use Nebula Logger. New custom log objects MUST NOT be created. |
| LOG-02 | Every entry point (TAF finalizer or service entry, controller, invocable, REST resource, Queueable, Batch, Schedulable, platform event handler) MUST log unhandled failures with the exception attached, and MUST call `Logger.saveLog()` once before returning or rethrowing. |
| LOG-03 | Inner layers (services, selectors, TAF actions) add entries but MUST NOT call `saveLog()` (TAF-07). |
| LOG-04 | Every entry point SHOULD set a scenario with `Logger.setScenario('<ValueStream>.<Process>')`, e.g. `FutureStudents.WebformIngest`. |
| LOG-05 | Async jobs MUST link to the parent transaction: pass `Logger.getTransactionId()` into the job and call `Logger.setParentLogTransactionId(parentId)` in `execute`. Call `Logger.setAsyncContext(ctx)` at the start of `execute`. |
| LOG-06 | Log entries for records MUST pass the record or record Id (`Logger.error(message, recordId, ex)`), so the entry links to the record. |
| LOG-07 | Personal data MUST NOT be written into log messages ([§5](07-logging-and-error-handling.md#5-personal-data-in-logs)). |
| LOG-08 | Logging level: `ERROR` for failures needing action, `WARN` for handled anomalies, `INFO` for business milestones in async/integration jobs, `DEBUG`/`FINE*` for diagnostics. Production default level is `INFO` for integration users and `WARN` for everyone else. |
| LOG-09 | Flows MUST log from every fault path using the Nebula `Add Log Entry` invocable actions, followed by `Save Log`. |
| LOG-10 | LWC MUST log errors with Nebula's `c/logger` LWC and save once per user action. |
| LOG-11 | Tags SHOULD be applied for cross-cutting concerns (`Integration:<System>`, `Purge`, `DataFix`) using `Logger.addTag` / `entryBuilder.addTag`, or tag rules in `LogEntryTagRule__mdt`. |
| LOG-12 | Log retention MUST be configured (§6). |

## 2. Apex usage

```apex
public with sharing class WebformIngestQueueable implements Queueable {
  private final Set<Id> stagingIds;
  private final String parentTransactionId;

  public WebformIngestQueueable(Set<Id> stagingIds) {
    this.stagingIds = stagingIds;
    this.parentTransactionId = Logger.getTransactionId();
  }

  public void execute(QueueableContext ctx) {
    Logger.setAsyncContext(ctx);
    Logger.setParentLogTransactionId(parentTransactionId);
    Logger.setScenario('FutureStudents.WebformIngest');
    try {
      WebformIngestResult result = new WebformIngestService().ingest(stagingIds);
      Logger.info('Webform ingest complete: ' + result.summary()).addTag('Integration:Webform');
    } catch (Exception e) {
      Logger.error('Webform ingest failed', e).addTag('Integration:Webform');
      throw e;
    } finally {
      Logger.saveLog();
    }
  }
}
```

Partial-success DML:

```apex
List<Database.SaveResult> results = Database.update(records, false, AccessLevel.SYSTEM_MODE);
for (Integer i = 0; i < results.size(); i++) {
  if (!results[i].isSuccess()) {
    Logger.error('Update failed', records[i].Id).setDatabaseResult(results[i]);
  }
}
```

Save method: the default `EVENT_BUS` (platform event) survives rollbacks and is the standard. `Logger.saveLog(Logger.SaveMethod.SYNCHRONOUS_DML)` is used only in contexts where publishing events is not allowed. `QUEUEABLE` is used when the transaction is near DML limits.

## 3. Flow usage

| Element | Use |
| --- | --- |
| `Add Log Entry` | Message, logging level, optional tags |
| `Add Log Entry for an SObject Record` | Fault paths operating on a record |
| `Add Log Entry for an SObject Record Collection` | Fault paths on collections |
| `Save Log` | Once, at the end of the fault path or flow |

Fault path message: `{!$Flow.FaultMessage}` plus the flow element name. Set the scenario in the first element of autolaunched flows.

## 4. LWC usage

```js
import { LightningElement } from 'lwc';
import { createLogger } from 'c/logger';

export default class EnquirySummaryCard extends LightningElement {
  logger;
  async connectedCallback() {
    this.logger = await createLogger();
    this.logger.setScenario('FutureStudents.EnquiryConsole');
  }
  async handleSave() {
    try {
      await saveEnquiry({ enquiryId: this.recordId });
    } catch (error) {
      this.logger.error('Enquiry save failed').setExceptionDetails(error).addTag('UI');
      this.logger.saveLog();
    }
  }
}
```

## 5. Personal data in logs

-   Log messages contain record Ids, counts, status values and error codes. They MUST NOT contain names, emails, phone numbers, addresses, dates of birth, student or government identifiers, or free-text bodies.
-   Integration payload logging is limited to structural details (HTTP status, correlation Id, record counts). Payload bodies MAY be logged at `FINE` in non-production orgs only.
-   Nebula `LogEntryDataMaskRule__mdt` rules MUST be active for email, phone and card-number patterns as a safety net.
-   Access to `Log__c` and `LogEntry__c` is granted through Nebula's permission sets (`LoggerLogViewer`, `LoggerEndUser`, `LoggerLogCreator`, `LoggerAdmin`) as part of support personas only.

## 6. Configuration and retention

| Setting (`LoggerSettings__c`) | Production | Sandboxes |
| --- | --- | --- |
| Default logging level | `WARN` | `DEBUG` |
| Integration user logging level | `INFO` | `FINE` |
| Default number of days to retain logs | 30 | 14 |
| Retention for logs with errors | 90 days via a `LogRetentionRule__mdt` rule | 30 |
| `IsApexSystemDebugLoggingEnabled` | false | true |
| Default save method | `EVENT_BUS` | `EVENT_BUS` |

`LogBatchPurger` is scheduled daily through the scheduler registry ([12 §5](12-asynchronous-processing.md#5-scheduled-jobs)) and deletes logs whose `LogRetentionDate__c` has passed. Log objects are excluded from the generic purge engine ([13](13-data-retention-and-purge.md)) because Nebula owns their lifecycle.

## 7. Monitoring and alerting

-   A `Log__c` list view and dashboard per value stream filtered by scenario and `TotalERRORLogEntries__c > 0`.
-   `LogEntryEvent__e` subscribers (Nebula Slack/Teams plugins or a custom TAF platform event action) alert on `ERROR` entries for integration scenarios.
-   Repeated identical errors are grouped by `LogEntry__c.ExceptionType__c` + `OriginLocation__c` in reports for triage.

## 8. Error handling summary

| Context | On failure |
| --- | --- |
| TAF before action, validation-type | `record.addError(Label)`. No log needed for expected validation. |
| TAF action, unexpected | Let it throw. The transaction rolls back. The entry point (UI/API) logs. For async-origin DML the job logs. |
| Controller | Log, save, throw `AuraHandledException` with safe message (APX-35) |
| REST resource | Log, save, return structured error body with correlation Id = `Logger.getTransactionId()` |
| Queueable | Log, save, rethrow. Transaction finalizer decides on retry ([12 §6](12-asynchronous-processing.md#6-error-handling-retries-and-idempotency)). |
| Batch `execute` | Partial-success DML, log failures per record, continue. Summarise in `finish`. |
| Flow | Fault path → Add Log Entry → Save Log → screen message or rollback |
