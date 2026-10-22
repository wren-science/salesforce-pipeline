# Apex (NPO-APEX)

| ID | Severity | Rule |
| --- | --- | --- |
| NPO-APEX-001 | Must | At most one trigger per object, covering all events it needs. |
| NPO-APEX-002 | Must | Triggers contain no logic; they delegate to a handler class (`<Object>TriggerHandler`). |
| NPO-APEX-003 | Must | Bulk-safe: no SOQL, DML or callouts inside loops; code handles 200 records per transaction. |
| NPO-APEX-004 | Must | Classes declare sharing explicitly: `with sharing` by default; `without sharing` or `inherited sharing` only with a comment explaining why. |
| NPO-APEX-005 | Must | Queries run in user mode (`WITH USER_MODE` or `AccessLevel.USER_MODE` for DML) unless the class documents why system mode is needed. |
| NPO-APEX-006 | Must | No hard-coded record type or user IDs; look them up by developer name. |
| NPO-APEX-007 | Should | Separate concerns: selector classes query, service classes hold business logic, handlers route trigger events. |
| NPO-APEX-008 | Must | Errors shown to users are clear and actionable (`addError` on the field when possible); unexpected exceptions are not swallowed. |
| NPO-APEX-009 | Should | Async work uses Queueable, not `@future`, so it can chain and be tested. |
| NPO-APEX-010 | Must | Code passes Salesforce Code Analyzer with no high-severity violations. |
