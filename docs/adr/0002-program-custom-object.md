# ADR-0002: Program custom object for the course catalogue

- Status: Accepted
- Date: 2026-10-22
- Deciders: Platform owner's delegate (pipeline maintainer, posting as `wrenscience` under the delegation in
  `docs/pipeline/governance.md`): plan decisions on issue #4. Proposed by the developer agent.
- Rules affected: DM-01, DM-03, DM-04, DM-07, DM-08, SHR-01, SHR-02, SHR-07, RET-01, DES-02, DES-09

## Context
Issue #4: Recruitment Officers need a catalogue of the programs (courses) the university offers, so that
enquiries and applications (#5, #8, #9) can name exactly which program a student is interested in. Each
program has a name, a Program Code that is unique and required, a Study Level (Undergraduate,
Postgraduate coursework, Research), a Faculty and an Active flag. Recruitment Officers create and edit
programs through their permission set (AC3); they do not delete them.

- **Entity:** one record per program offered. No relationships yet; #5, #8 and #9 add lookups from Lead
  and Opportunity to Program (many enquiries/applications to one program).
- **Persona:** Recruitment Officer (`recruitment-officer`) maintains the catalogue. No other persona changes.
- **Volume:** about 300 rows in year 1 and about 500 in year 3, growing with the number of new programs
  offered. Tier 3; no share rows (see Access). LDV-01 does not apply.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| 1. Education Cloud `LearningProgram` / `LearningCourse` | Standard model for programs; reusable across value streams | Not available in this org's edition or in the pipeline's scratch orgs today, so `force-app` could not deploy (PIPE-04) |
| 2. `Product2` (Name, ProductCode, IsActive, Family) | Standard object, already enabled | ProductCode cannot be made unique or an External Id; programs would mix with sellable products; price books are out of scope (no fees) |
| 3. Custom metadata type | Deployed with code; no storage | Business users must create and edit rows in the UI (AC3); 01 §6 rules it out for user-maintained data |
| 4. **Custom object `Program__c`** | Unique, case-insensitive External Id code; restricted picklists; access through the persona's permission set | A new object to own (this ADR) |

## Decision
Option 4, `Program__c`, because options 1–3 fail as above (09 §2 ladder, DES-02, DES-09).

- **Fields:** Name ("Program Name", Text); `Program_Code__c` Text(20), required, unique, case-insensitive,
  External Id: the code is mastered in the student system (DM-07); `Study_Level__c` and `Faculty__c`
  restricted picklists with stable API names (DM-08); `Active__c` checkbox, default true.
- **Access:** internal OWD **Public Read/Write**, external OWD Private. Programs are published reference data;
  who may create and edit is limited by object permission, which only `Persona_Recruitment_Officer` (in PSG
  `Recruitment_Officer`) grants: Read, Create, Edit; no Delete, View All or Modify All. No sharing rule and no
  data-scope group, which avoids the catch-all criteria SHR-07 forbids. This is the OWD decision SHR-02 asks for.
  Sharing recalculation (08 §6): none needed. The object is new, with no existing rows or share rows. Any later
  move to Private needs its own ADR with a recalculation plan.
- **Classification:** `Public` on every field (the catalogue is published); no personal data, so no
  `ComplianceGroup`. Business owner: Head of Student Recruitment (object description, DM-03).
- **Lifecycle:** Retain Indefinitely. Programs are deactivated (`Active__c = false`), not deleted. The
  `Data_Retention_Policy__mdt` row is added when the retention engine lands in this repo (DM-04, RET-01).
- **Integration:** the student system is the source of truth for Program Code. Any future sync is inbound,
  upserting on `Program_Code__c`; that integration needs its own ADR (INT-01).
- **Reuse:** any value stream needing a program reference looks up `Program__c`. Faculty stays a picklist
  until faculties have their own data; then revisit as a lookup.
- **Reporting:** no report type yet (`enableReports` false); #14 may add one.
- **AC2 error:** the platform's duplicate-value error on the unique field is the accepted "clear error"; no
  Apex or duplicate rule (DES-02).

## Consequences
- A GU-style org with Education Cloud should revisit this decision and consider migrating to
  `LearningProgram`.
- QA has no `Program__c` and no other object labelled Program, so there is no label clash.
- Tests: `ProgramCatalogueTest` (Apex, as the Recruitment Officer and Minimum Access personas, user mode)
  and `tests/e2e/specs/4-program-catalogue.spec.ts` (Playwright, as the Recruitment Officer).
- Playwright creates `E2E-*` Programs the persona cannot delete. In QA the harness removes them with the
  pipeline's own identity after the run (plan decision 6b, PIPE-15). That clean-up is not in the harness yet.
- Rollback: remove the Program tab from the Recruitment app and the permission set entries, then delete the
  object in a separate destructive PR (QG-09, DES-11) once no lookups reference it.
