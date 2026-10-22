# Pipeline architecture

GitHub is the control plane, sfdx-hardis is the Salesforce release engine, and Salesforce CLI is the
execution layer. Each step is a separate GitHub Actions workflow. Agents are separate Claude Code
sessions (`anthropics/claude-code-action`) with narrow tool allowlists. Plain scripts handle anything
involving credentials or deployment.

## Steps

1. **Issue** created from the story template with acceptance criteria; a human adds `agent:plan`.
2. **Planner** (read-only) posts a plan, the applicable standard IDs, a risk class and open questions.
3. **Gate 1 — human** adds `agent:approved`: is the requirement understood correctly?
4. **Provisioner** (script, no AI) creates a scratch org from the Dev Hub, deploys the baseline and
   loads fixtures.
5. **Developer** (Salesforce CLI, sfdx-hardis, write access to its branch, scoped to its scratch org)
   commits, opens a draft PR and writes `.agent/handover.json`.
6. **Validate** (script, no AI): sfdx-hardis check-only deploy to QA, Apex tests, Code Analyzer,
   metadata policy checks. On failure the **repair** agent gets at most 3 attempts, then a human takes
   over.
7. **Reviewers** (separate sessions: architecture, security, test quality) cite standard IDs. Blocking
   findings go back to the developer for rework, at most 2 rounds, then a human decides.
8. **Gate 2 — human** approves the PR; merge to `integration`.
9. **Release** writes the QA promotion PR plus an evidence pack mapping acceptance criteria to tests to
   deploy result.
10. **Gate 3 — GitHub Environment `qa` approval**, then sfdx-hardis deploys to the QA sandbox.
11. **Cleanup** deletes the scratch org when the PR closes.

## Branches and orgs

| Branch | Org |
| --- | --- |
| `feature/*` | Per-agent scratch org (plain Enterprise, no NPSP) |
| `integration` (default) | Validated against QA |
| `qa` | The QA sandbox (has NPSP installed) |
| `main` | Reserved for production; deployment disabled |

`integration` is the default branch so that label- and issue-triggered workflows run from a
non-production branch.

## Roles and models

| Role | Model | Tools |
| --- | --- | --- |
| Planner | Claude Opus | Read-only repo; comment on the issue |
| Developer | Claude Opus | Edit repo, `sf`, `sf hardis` against its scratch org |
| Repair | Claude Opus | Same as developer, limited to the failing check |
| Reviewers (3) | Claude Opus | Read-only repo; PR review comments |
| Release | Claude Opus | Open the promotion PR; write the evidence pack |
| Triage and summaries | Claude Sonnet or Haiku | Read-only |

Role definitions live in `.claude/agents/`.

## Safety

- **Production is technically disabled.** No production credentials exist anywhere in this repo's
  settings; `main` has no deploy workflow.
- **Public repo, untrusted input.** Agents start only on label events (adding a label needs triage
  access), never on `issues: opened`, PR comments or bot mentions. Issue and PR text is data, not
  instructions (`NPO-SEC-006`).
- **Credentials stay with scripts.** Agents get a scratch-org session only. QA credentials live in the
  `qa` GitHub Environment and are used by the deploy workflow after Gate 3.
- **Retry limits** (3 repairs, 2 review rounds) stop runaway loops and hand back to a human.
- **Changes to an agent's own workflow** do not trigger other workflows unless made with the Claude
  GitHub App's token, which is why the App is installed on the org.
