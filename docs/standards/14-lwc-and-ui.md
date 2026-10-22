# 14 · LWC and UI

## 1. UI technology choice

| Need | Use |
| --- | --- |
| Record page layout, field visibility by persona | Dynamic Forms, Dynamic Actions, component visibility rules (by custom permission) |
| Guided process | Screen Flow ([02](02-automation-flow-vs-apex.md)) |
| Custom display or interaction not possible declaratively | Lightning Web Component |
| Reusable screen-flow input | LWC exposed as a flow screen component |
| Aura | Maintenance only. New Aura components MUST NOT be created. |
| Visualforce | Maintenance only, except PDF rendering where no alternative exists |
| OmniStudio | Only where an existing OmniStudio solution is being extended. New use needs an ADR. |

## 2. Rules

| ID | Rule |
| --- | --- |
| UI-01 | Data access SHOULD use Lightning Data Service (`lightning/uiRecordApi`, `lightning-record-form`, GraphQL wire adapter) before Apex. LDS enforces sharing, CRUD and FLS and caches across components. |
| UI-02 | Apex controllers for LWC are `with sharing`, use user mode (APX-21/23), and return DTOs. Read-only methods are `@AuraEnabled(cacheable=true)`. |
| UI-03 | Controllers MUST be bulk-safe and paginated. Lists over 50 rows use server-side paging (keyset, [04 §6](04-apex-coding-standards.md#6-soql-and-dml-details)). |
| UI-04 | Components MUST NOT hard-code labels or messages. Use Custom Labels (`@salesforce/label/c.*`). |
| UI-05 | Components MUST handle loading, empty and error states. Errors go to the user via `lightning-platform-show-toast-event` or an inline message and are logged via Nebula `c/logger` (LOG-10). |
| UI-06 | Visibility of a component by persona uses custom permissions (`@salesforce/customPermission/*`) or component visibility rules. Profile-name checks are prohibited. |
| UI-07 | No direct DOM manipulation outside the component's template. Use `lwc:ref` and `this.template.querySelector`. No `innerHTML` with untrusted data. |
| UI-08 | Third-party JS is loaded from static resources with `loadScript`, versioned, and reviewed for Lightning Web Security compatibility. CDN loading is prohibited. |
| UI-09 | Components meet WCAG 2.2 AA: labels on inputs, keyboard navigation, focus management in modals, colour contrast via SLDS styling hooks. |
| UI-10 | Use SLDS base components and styling hooks. Custom CSS that overrides SLDS internals is prohibited. |
| UI-11 | Every component has Jest tests (TST-14). Wire adapters and imperative Apex are mocked. |
| UI-12 | Components communicate parent→child via `@api` properties, child→parent via events, unrelated components via Lightning Message Service. Pub/sub libraries and global window events are prohibited. |
| UI-13 | `@api` properties are treated as read-only inside the component. Copy before mutating. |
| UI-14 | Imperative Apex calls are not made in `renderedCallback` without a guard. Expensive work is debounced on user input. |

## 3. Component structure

```
lwc/
  enquirySummaryCard/
    enquirySummaryCard.html
    enquirySummaryCard.js
    enquirySummaryCard.js-meta.xml   // targets, design attributes, apiVersion
    enquirySummaryCard.css           // optional, SLDS hooks only
    __tests__/
      enquirySummaryCard.test.js
```

Shared utilities live in service components (no template), e.g. `lwc/dateUtils`, `lwc/errorUtils` (normalises `reduceErrors`).

## 4. Example pattern

```js
import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import STATUS from '@salesforce/schema/Case.Status';
import getRelatedApplications from '@salesforce/apex/EnquiryController.getRelatedApplications';
import LABEL_NONE from '@salesforce/label/c.Enquiry_No_Applications';
import { reduceErrors } from 'c/errorUtils';

export default class EnquirySummaryCard extends LightningElement {
  @api recordId;
  labels = { none: LABEL_NONE };
  applications;
  error;

  @wire(getRecord, { recordId: '$recordId', fields: [STATUS] })
  caseRecord;

  get status() {
    return getFieldValue(this.caseRecord.data, STATUS);
  }

  @wire(getRelatedApplications, { caseId: '$recordId' })
  wiredApps({ data, error }) {
    this.applications = data;
    this.error = error ? reduceErrors(error).join(', ') : undefined;
  }

  get isEmpty() {
    return Array.isArray(this.applications) && this.applications.length === 0;
  }
}
```

## 5. Performance

-   Prefer one cacheable Apex call returning a composed DTO over several calls on load.
-   Use `refreshApex` / `notifyRecordUpdateAvailable` after DML in place of page reloads.
-   Lazy-load heavy child components (`lwc:if` on a tab or expand action).
-   Datatables over 200 rows use infinite loading with server paging.
