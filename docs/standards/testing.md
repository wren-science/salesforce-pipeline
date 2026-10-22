# Testing (NPO-TEST)

| ID | Severity | Rule |
| --- | --- | --- |
| NPO-TEST-001 | Must | Every Apex class and trigger has tests with at least 85% coverage, and the org-wide total never drops. |
| NPO-TEST-002 | Must | Tests assert behaviour (`Assert.areEqual` and friends), not just run code. Each acceptance criterion maps to at least one test method. |
| NPO-TEST-003 | Must | Tests create their own data through a test data factory and never use `SeeAllData=true`. Data must satisfy validation rules in both scratch orgs and QA, where NPSP triggers also run on Account, Contact and Opportunity. |
| NPO-TEST-004 | Must | Bulk tests insert 200 records for any trigger or record-triggered flow. |
| NPO-TEST-005 | Must | Security-relevant code has a test that runs as a restricted user (`System.runAs`) and proves access is enforced. |
| NPO-TEST-006 | Should | Flows with logic have Flow tests, or Apex tests that exercise them through DML. |
| NPO-TEST-007 | Must | Test method names say what they prove: `convertLead_withExistingAccount_attachesContact`. |
