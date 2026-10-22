# Handover protocol

Agents never rely on conversation history. Everything the next step needs is in GitHub: labels, check
runs and the committed `.agent/handover.json`.

## Labels

| Label | Set by | Meaning |
| --- | --- | --- |
| `agent:plan` | Backlog owner | Please plan this issue |
| `agent:planned` | Planner | Plan posted |
| `agent:approved` | Planner (low risk) or a person | Plan accepted; start development |
| `agent:developing` | Developer | Work in progress on a draft PR |
| `agent:review-required` | Developer / Validate | Checks passed; reviewers may start |
| `agent:rework-required` | Reviewer | Blocking findings; developer must respond |
| `human:approval-required` | Any agent, merge gate | Stopped: needs a person (ambiguity, conflict, retry limit); never auto-merged |
| `human:review-wanted` | Anyone | A person wants to review: the merge gate waits for their approval of the current commit. Approve, then remove the label (that runs the gate) |
| `release:qa-ready` | Release | Promotion PR and evidence pack ready; waiting for Gate 3 |
| `release:qa-deployed` | Deploy workflow | Deployed to QA |

## Agent records

The handover, the investigation log and review findings have fixed shapes: see [agent-records.md](agent-records.md).

## `.agent/handover.json` (legacy shape; version 2 is in agent-records.md)

Written by every agent before it finishes, committed on the story's branch.

```json
{
  "issue": 12,
  "stage": "review-required",
  "role": "developer",
  "summary": "Added Lead matching and duplicate rules on email and company.",
  "standards": ["DES-01", "DES-02", "TST-03", "TST-16"],
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
