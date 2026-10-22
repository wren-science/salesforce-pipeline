# Use case: Sales Cloud lead-to-opportunity

The proof demonstrates agents delivering small, real Sales Cloud stories end to end. The scope is the
standard sales process: **Lead → convert → Account, Contact, Opportunity → close**.

## Why Sales Cloud

- The QA sandbox's Lead and Opportunity objects carry no custom fields yet, so every change in this
  repo is new and easy to see.
- The org runs NPSP for fundraising. This repo stays out of NPSP's way: no NPSP metadata in
  `force-app`, and every plan checks for conflicts with NPSP's Account, Contact and Opportunity
  behaviour (`NPO-SALES-005`).

## Objects in scope

| Object | Typical stories |
| --- | --- |
| Lead | Capture, qualification, duplicate prevention, assignment, conversion mapping |
| Account | Business account details for converted leads |
| Contact | Contact created on conversion |
| Opportunity | Stages, required fields per stage, products later |

## Demo story

**Prevent duplicate leads.** As a sales user, when I create a lead whose email (or company and name)
matches an existing lead or contact, I'm warned and shown the match, so we don't chase the same person
twice.

Acceptance criteria:

1. Creating a lead with the same email as an existing lead shows a duplicate alert listing the match.
2. Creating a lead with the same company and last name as an existing lead shows the alert.
3. A lead with a different email and company saves without an alert.
4. The rule works for leads created through the API, not just the UI.

Expected approach: standard Matching and Duplicate Rules (`NPO-SALES-001`, `NPO-FLOW-007`) with Apex
tests proving each criterion (`NPO-TEST-002`).

## Backlog of follow-on stories

| Story | Exercises |
| --- | --- |
| Lead qualification fields and a required-at-conversion validation rule | Validation rules, conversion mapping |
| Auto-assign web leads by region | Assignment rules, Flow |
| Normalise lead email and phone on save | Before-save Flow (`NPO-FLOW-001`) |
| Required fields per opportunity stage | Validation rules, sales process |
| Opportunity close summary on Account | After-save automation, bulk tests |
