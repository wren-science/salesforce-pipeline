# Playwright run 1 for #6 (2026-10-23)

## AC1/AC2: the duplicate alert in the Lightning New Lead form

After Save, Lightning shows its own popover (aria snapshot from the failed run):

    - dialog "Similar Records Exist":
      - heading "Similar Records Exist" [level=2]
      - text: This record looks like an existing record. Make sure to check any potential duplicate records before saving.
      - link "View Duplicates"

The rule's alertText ("This person may already be in the system. …") isn't shown in Lightning Experience; it is
returned to API and Apex callers (`DuplicateResult.getErrorMessage()`, asserted in LeadDuplicateRuleTest and passing).
The "View Duplicates" list did name the matching Lead or Contact once the alert locator was changed (all 5 #6 tests passed).
No other Lead duplicate rule is active in the sandbox (lead-inserters.md), so the popover can only come from this rule.

## AC4: restAs got 401

`restAs` took the persona's access token from `sf org display` and called fetch; the API answered 401 although
`createRecordAs` (an `sf data create record` call as the same persona) had just succeeded. `sf api request rest … --include`
as the persona authenticated fine (a GET returned an HTTP response with a JSON body). restAs now goes through that command,
so no token ever reaches test code. AC4 then got 400 DUPLICATES_DETECTED naming Prospective_Student_Lead_Duplicate,
and 201 with `Sforce-Duplicate-Rule-Header: allowSave=true`.
