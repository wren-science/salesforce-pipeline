# Sales Cloud (NPO-SALES)

Rules for the Lead-to-Opportunity process this repo demonstrates. Background:
[docs/use-case/sales-cloud.md](../use-case/sales-cloud.md).

| ID | Severity | Rule |
| --- | --- | --- |
| NPO-SALES-001 | Must | Duplicate prevention uses standard Duplicate and Matching Rules first; custom matching needs a written reason in the plan. |
| NPO-SALES-002 | Must | Lead conversion keeps working from the standard Convert button: custom fields that must carry over are mapped in Lead field mapping, not copied in code. |
| NPO-SALES-003 | Must | Opportunity stage changes are driven by the sales process and stage picklist; automation does not skip stages silently. |
| NPO-SALES-004 | Should | Lead source and campaign attribution use standard fields (`LeadSource`, Campaign Influence) so standard reports keep working. |
| NPO-SALES-005 | Must | Do not change the behaviour of Account, Contact or Opportunity in ways that conflict with NPSP in QA (household accounts, donations). Check the plan against NPSP before building. |
| NPO-SALES-006 | Should | Every story names the report or list view a user will use to see its result, and the PR shows it. |
