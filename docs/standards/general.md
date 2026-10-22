# General (NPO-GEN)

| ID | Severity | Rule |
| --- | --- | --- |
| NPO-GEN-001 | Must | One story per branch and PR. The PR links its issue and changes nothing outside the story's acceptance criteria. |
| NPO-GEN-002 | Must | Clicks-before-code: use declarative tools (validation rules, Flow, duplicate rules) when they meet the requirement and stay maintainable; justify Apex in the plan. |
| NPO-GEN-003 | Must | API names are PascalCase English words with no abbreviations an admin wouldn't recognise (`Lead_Source_Detail__c`, not `LSD__c`). |
| NPO-GEN-004 | Must | Every custom object, field, Flow and Apex class has a description that says why it exists. |
| NPO-GEN-005 | Should | Prefer standard objects and fields over custom ones that duplicate them (for example, use `Lead.LeadSource`, not a new source field). |
| NPO-GEN-006 | Must | No hard-coded IDs, usernames, URLs or org-specific values. Use Custom Metadata, Custom Labels or Named Credentials. |
| NPO-GEN-007 | Should | Leave the code you touch cleaner than you found it, but put unrelated refactors in their own story. |
