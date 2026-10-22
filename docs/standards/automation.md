# Flow and declarative automation (NPO-FLOW)

| ID | Severity | Rule |
| --- | --- | --- |
| NPO-FLOW-001 | Must | Use before-save record-triggered flows for same-record field updates; after-save only when you need related records or actions. |
| NPO-FLOW-002 | Must | Every record-triggered flow has entry conditions so it runs only when relevant fields change. |
| NPO-FLOW-003 | Must | No Get Records, Create, Update or Delete elements inside loops. |
| NPO-FLOW-004 | Must | Every flow that writes data has fault paths that surface a clear error. |
| NPO-FLOW-005 | Should | One automation tool per object and event where practical: do not split the same logic between Flow and Apex. |
| NPO-FLOW-006 | Must | Flows are named `<Object>_<Trigger>_<Purpose>` (for example `Lead_BeforeSave_NormaliseEmail`) and carry a description. |
| NPO-FLOW-007 | Should | Prefer Duplicate and Matching Rules over custom automation for duplicate prevention. |
