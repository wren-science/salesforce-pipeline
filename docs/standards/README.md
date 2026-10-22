# Engineering standards

These are the canonical standards for this repo. Agents read them before planning, cite them when
building, and reviewers block changes that break them. The GitHub Wiki, if used, is only a published
view of this folder.

**Status: draft starter set.** They are deliberately short. Rewrite them in your own words in Phase 2;
keep the IDs stable once anything cites them.

## ID scheme

`NPO-<AREA>-<NNN>`, for example `NPO-APEX-004`. Numbers are never reused. A retired rule stays in its
file marked **Retired** so old citations still resolve.

| Area | File | Covers |
| --- | --- | --- |
| `GEN` | [general.md](general.md) | Change scope, naming, documentation |
| `META` | [metadata.md](metadata.md) | Data model, fields, profiles and permission sets |
| `APEX` | [apex.md](apex.md) | Apex design, triggers, governor limits |
| `FLOW` | [automation.md](automation.md) | Flow and declarative automation |
| `TEST` | [testing.md](testing.md) | Apex tests, coverage, test data |
| `SEC` | [security.md](security.md) | Sharing, CRUD/FLS, secrets |
| `SALES` | [sales-cloud.md](sales-cloud.md) | Lead, Account, Contact and Opportunity rules for this use case |

## Severity

Each rule is **Must** (a reviewer blocks the PR) or **Should** (a reviewer comments; a human decides).

## How to cite

In a plan, commit or review, write the ID and one line on how it applies:

> `NPO-APEX-002`: trigger delegates to `LeadTriggerHandler`; no logic in the trigger body.

Every PR fills in the standards-citation table in the pull request template.
