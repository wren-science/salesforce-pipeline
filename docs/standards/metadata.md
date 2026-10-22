# Metadata and data model (NPO-META)

| ID | Severity | Rule |
| --- | --- | --- |
| NPO-META-001 | Must | Grant access with permission sets (grouped in permission set groups), not profiles. Profile changes need a human-approved exception. |
| NPO-META-002 | Must | Source in `force-app` deploys cleanly to a plain Enterprise scratch org: no dependencies on managed-package metadata (`npsp__`, `npe0x__` and similar). |
| NPO-META-003 | Must | Never retrieve or commit metadata outside the story's scope. Whole-org retrieves are not allowed. |
| NPO-META-004 | Must | Picklist values that drive logic are restricted picklists or Global Value Sets; logic compares API names, never labels. |
| NPO-META-005 | Should | Required-ness lives in validation rules or page layouts, not the field definition, unless the field is required for every record from every channel. |
| NPO-META-006 | Must | Destructive changes are explicit: list deletions in the PR and let sfdx-hardis generate `destructiveChanges.xml` (auto-clean type `destructivechanges`). |
| NPO-META-007 | Should | Every new field shows on at least one Lightning page or layout, or the PR says why it is hidden. |
