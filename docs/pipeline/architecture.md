# Pipeline architecture

GitHub is the control plane, sfdx-hardis is the Salesforce release engine, and Salesforce CLI is the
execution layer. Agents are Claude Code sessions (`anthropics/claude-code-action`, pinned) started by
GitHub Actions on label and check events. Every design and security decision starts from a persona
(DES-01), and every test runs as one (TST-16). The binding rules are the
[Solution Design and Build Standards](../standards/README.md); [rules.md](rules.md) adds the pipeline's own.

## A story, end to end

1. **Issue** from the story template: user story, personas, acceptance criteria (each naming its persona).
   A maintainer adds `agent:plan`.
2. **Planner agent** (`agent-plan.yml`) posts a plan: personas and their access changes, platform-first
   approach (DES-02), rule IDs, ADRs needed (01 §4), tests per criterion, risk. A low-risk plan with no ADR
   and no open questions approves itself (`agent:approved`); otherwise a person decides
   (`human:approval-required`).
3. **Test writer, then developer** (`agent-build.yml`), in the story's leased pool sandbox (ADR 0003), a source-tracked copy of the real org brought up to integration: tests first, as personas,
   then the build until every test passes. The developer opens a draft PR.
4. **PR checks** (`pr-checks.yml`): metadata and data classification (QG-07), NPSP guard (PIPE-04),
   `.github` guard (PIPE-08), secret scan (QG-08), Code Analyzer (QG-03).
5. **PR tests** (`pr-tests.yml`): the PR deployed to the story's sandbox, persona users, this repo's Apex tests and the Playwright
   acceptance tests as personas, with an evidence comment on the PR (`tests/personas`).
6. **QA validation** (`validate-qa.yml`): sfdx-hardis check-only deploy to the QA sandbox (`validate/qa`).
7. **Review agents** (`agent-review.yml`): architecture, security and tests, citing rule IDs. A blocking
   finding adds `agent:rework-required`.
   When all three are approve-able, the commit gets the status `review/agents`.
8. **Repair agent** (`agent-repair.yml`) when persona tests or QA validation fail, or a reviewer asks for
   rework: at most 3 attempts (one per commit), then a person (`human:approval-required`).
9. **Merge gate** (`merge-gate.yml`, `scripts/merge-gate.mjs`): when `Static checks`, `tests/personas`,
   `validate/qa` and `review/agents` have passed on the PR's current commit, it marks the PR ready and squash-merges it.
   Agents cannot approve or merge; the gate is plain code. If `integration` has moved since the QA
   validation, it re-runs that validation first, so a story is always validated against QA as it is now.
   It also comments the lead time and agent cost on the issue.
10. **Deploy to QA** (`deploy-qa.yml`, dispatched by the gate): sfdx-hardis deploy, persona users kept current
    in QA, Playwright regression as personas.

People step in where they want to or where they're needed. Adding `human:review-wanted` to a PR makes the gate
wait for a person's approval of the current commit (approve, then remove the label). The gate is event-driven,
not scheduled: checks and reviews completing, a person's label change, or a released sandbox start it. Agents set `human:approval-required` when a plan is above
low risk, a requirement is ambiguous, an ADR is needed or the repair limit is reached; the gate never merges
those.

## Branches and orgs

| Branch | Org | Status |
| --- | --- | --- |
| `feature/<issue>-<slug>` | The story's leased pool sandbox (agents, PR tests, repair; ADR 0003) | Built |
| `pipeline/<topic>` | Maintainer changes to the pipeline itself (may change `.github/`) | Built |
| `integration` (default) | QA sandbox (our dev org), deployed on every merge | Built |
| `uat`, `preprod`, `main` | UAT, preprod, production, by promotion PRs | Planned |

## Agents

| Agent | Workflow | Can change | Model |
| --- | --- | --- | --- |
| Planner | `agent-plan.yml` | One issue comment, labels | Opus 5.5 |
| Test writer | `agent-build.yml` | Tests on the story branch | Opus 5.5 |
| Developer | `agent-build.yml` | The story branch, a draft PR | Opus 5.5 |
| Reviewers (3) | `agent-review.yml` | PR comments, the rework label | Opus 5.5 |
| Repair | `agent-repair.yml` | The story branch | Opus 5.5 |

Role definitions: `.claude/agents/`. Rules every agent follows: `CLAUDE.md`.

## Safety

- **Production is not reachable.** No production deploy exists; the production org is only the Dev Hub,
  whose login never shares a runner with PR code or an agent (PIPE-09).
- **Public repo, untrusted input.** Agents start on labels and checks only; issue and PR text is data,
  not instructions (PIPE-07). Fork PRs never reach the trusted workflows.
- **Agents hold only short-lived logins**: access tokens for their story's sandbox, encrypted in transit and revoked after use, and
  the Claude token from the `agents` environment, which only `integration` can use.
- **Agents cannot change the pipeline**: `.github/**` and `manifest/**` are denied to their tools, and PR
  checks fail any story branch that touches `.github/` (PIPE-08).
- **Retry limits** (3 repairs) stop loops and hand back to a person.
