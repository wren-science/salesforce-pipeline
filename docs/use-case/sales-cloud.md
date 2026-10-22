# Use case: student recruitment on Sales Cloud

The proof shows agents delivering small, real Sales Cloud stories end to end. The scenario is a
university recruiting students, mapped onto the standard sales process:

| Recruitment idea | Sales Cloud object |
| --- | --- |
| A prospective student's enquiry | **Lead** |
| An enquiry that becomes an application | Lead conversion → **Contact** + **Opportunity** |
| An application moving through admissions | **Opportunity** with a Student Recruitment sales process |
| A course a student can apply for | **Program** (custom object) |
| An enrolled student | **Contact** with Student Status = Enrolled |

Application stages: Enquiry → Application Started → Application Submitted → Offer Made → Offer
Accepted → **Enrolled** (closed won) or **Not Proceeding** (closed lost).

## Backlog

The stories are GitHub issues under the epic
[#3 Student recruitment on Sales Cloud](https://github.com/wren-science/salesforce-pipeline/issues/3),
tracked on the [Salesforce Delivery project board](https://github.com/orgs/wren-science/projects/1).
Each uses the story template with numbered acceptance criteria.

| Issue | Story | Exercises |
| --- | --- | --- |
| #4 | Program catalogue | New object, unique field, permission set |
| #5 | Enquiry details on Lead | Fields, lookup filter |
| #6 | Prevent duplicate prospective students (**demo story**) | Matching and Duplicate Rules |
| #7 | Applications as opportunities | Record type, sales process, NPSP coexistence |
| #8 | Conversion creates an application | Lead field mapping |
| #9 | An offer needs a program and intake | Validation rules |
| #10 | Route international enquiries | Assignment rules, queues |
| #11 | Tidy email and mobile on save | Before-save Flow |
| #12 | Flag stalled applications | Apex trigger, custom metadata, bulk tests |
| #13 | Mark the student enrolled | After-save automation on a related record |
| #14 | Recruitment funnel dashboard | Reports and dashboards in source |

Suggested order: #4 → #5 → #6 → #7 → #8, then the rest in any order.

## Working alongside NPSP

The QA sandbox runs NPSP for fundraising, and NPSP has its own Account, Contact, Opportunity and lead
conversion behaviour. This repo stays out of its way: no NPSP metadata in `force-app`, new behaviour
scoped to the Student Application record type, and every plan checks for conflicts
(DES-12, PIPE-04). Scratch orgs don't have NPSP, so tests must pass in both.
