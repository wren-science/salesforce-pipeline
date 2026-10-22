# Agent records

Agents pass context to each other only through GitHub (PIPE-06): issues, PRs, commits and these records. Each
record has a fixed shape, so every story's records look the same, people can read them, and the pipeline can
compare one story with another. Agents never write free-form reports.
Use `scripts/agent-records.mjs` to write and read them. PR checks reject a record that doesn't fit its shape.
Every text field is a sentence or two, at most about 600 characters.

## Investigation log: `.agent/<issue>/investigation.jsonl`

Investigation steps are appended one at a time and never edited, by every agent. **Read it before you
investigate** (`tried`), and never repeat a step already marked `ruled-out` unless something has changed. If
you repeat one, say what changed.

```bash
node scripts/agent-records.mjs tried --issue 20
node scripts/agent-records.mjs log --issue 20 --role repair \
  --hypothesis "A ListView query by SobjectType returns no rows after a no-access persona queries" \
  --action "Ran both test classes in one check-only deploy to the sandbox" \
  --result "The positive test saw 0 list views; alone it saw 1" \
  --conclusion confirmed --evidence .agent/20/diagnostics/listview-repro.apex
```

| Field | Meaning |
|---|---|
| `role` | planner, test-writer, developer, repair or a reviewer role |
| `hypothesis` | What you thought might be true |
| `action` | What you ran or tried to test it |
| `result` | What you saw |
| `conclusion` | `confirmed`, `ruled-out` or `inconclusive` |
| `evidence` | Links or committed paths. Small experiments go under `.agent/<issue>/diagnostics/`, so they outlive the runner. |

`at` and `run` are filled in by the CLI.

## Handover: `.agent/<issue>/handover.json` (version 2)

The current state of the story, rewritten by the test writer, developer and repair agent on every commit.

```json
{
  "version": 2,
  "issue": 4,
  "stage": "review-required",
  "role": "developer",
  "summary": "Program catalogue built declaratively: Program__c with …",
  "standards": ["DES-01", "DM-01", "SHR-02"],
  "adrs": ["docs/adr/0002-program-custom-object.md"],
  "acceptanceCriteria": [
    { "id": "AC1", "status": "passed", "evidence": "ProgramCatalogueTest.shouldLet…; Playwright '#4 AC1: …'" }
  ],
  "testChanges": [
    { "test": "ProgramCatalogueTest.shouldGrant…", "change": "Describes run inside System.runAs",
      "whyNotWeaker": "Outside runAs they reported the admin's FLS; assertions unchanged" }
  ],
  "findings": [ { "id": "sec-1", "status": "fixed", "note": "Grant moved to the persona permission set" } ],
  "openQuestions": [ { "question": "QA clean-up of E2E-* records is pipeline-owned", "owner": "pipeline" } ],
  "next": "reviewers"
}
```

- `stage`: `tests-written`, `review-required`, `rework` or `blocked`.
- `acceptanceCriteria[].status`: `passed`, `failing` or `not-built`.
- `findings`: your answer to each review finding, `fixed` or `disputed` with a note.
- `openQuestions[].owner`: `person` (needs `human:approval-required`) or `pipeline` (the maintainer's to fix).
- Attempt counts, sandbox and commit are not part of the handover: the pipeline records them from its own runs.

## Review: `review.json`

Reviewers write their review as JSON and never post it themselves. The pipeline validates it, renders the PR
comment, embeds the JSON in it, and sets `agent:rework-required` when a finding is blocking. Every review
therefore looks the same, and the verdict comes from data.

```json
{
  "role": "reviewer-security",
  "verdict": "changes-needed",
  "scope": "Persona access, sharing, CRUD/FLS, secrets for #20",
  "findings": [
    { "id": "sec-1", "rule": "DES-01", "blocking": true,
      "file": "force-app/main/default/permissionsets/Persona_Recruitment_Officer.permissionset-meta.xml", "line": 15,
      "problem": "Read access to Lead.LeadSource has no recorded acceptance (governance.md)",
      "fix": "Record a person's acceptance on the story, or remove the grant" }
  ]
}
```

- `verdict`: `approve-able` (no blocking findings) or `changes-needed`.
- `id`: `<sec|arch|tests>-<n>`. Keep the same id for the same problem in later rounds, so repairs and the
  health check can follow it.
- `blocking`: true when a MUST rule is broken; false for a SHOULD.

The repair agent reads open findings with `node scripts/agent-records.mjs findings --pr <n>`, and answers each
one in the handover's `findings`.
