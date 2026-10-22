# Handover protocol

Agents never rely on conversation history. Everything the next step needs is in GitHub: labels, check
runs and the committed `.agent/handover.json`.

## Labels

| Label | Set by | Meaning |
| --- | --- | --- |
| `agent:plan` | Human | Please plan this issue |
| `agent:planned` | Planner | Plan posted; waiting for Gate 1 |
| `agent:approved` | Human (Gate 1) | Plan accepted; start development |
| `agent:developing` | Developer | Work in progress on a draft PR |
| `agent:review-required` | Developer / Validate | Checks passed; reviewers may start |
| `agent:rework-required` | Reviewer | Blocking findings; developer must respond |
| `human:approval-required` | Any agent | Stopped: needs a person (ambiguity, conflict, retry limit) |
| `release:integration` | Merge workflow | Merged to `integration` |
| `release:qa-ready` | Release | Promotion PR and evidence pack ready; waiting for Gate 3 |
| `release:qa-deployed` | Deploy workflow | Deployed to QA |

## `.agent/handover.json`

Written by every agent before it finishes, committed on the story's branch.

```json
{
  "issue": 12,
  "stage": "review-required",
  "role": "developer",
  "summary": "Added Lead matching and duplicate rules on email and company.",
  "standards": ["NPO-SALES-001", "NPO-FLOW-007", "NPO-TEST-002"],
  "acceptanceCriteria": [
    { "id": "AC1", "status": "met", "evidence": "LeadDuplicateRuleTest.blocksExactEmailMatch" },
    { "id": "AC2", "status": "met", "evidence": "LeadDuplicateRuleTest.allowsDifferentCompany" }
  ],
  "scratchOrg": "feature/12-lead-duplicates",
  "attempts": { "repair": 0, "review": 1 },
  "openQuestions": [],
  "next": "reviewers"
}
```

`stage` mirrors the label without its prefix. `attempts` enforces the retry limits.
