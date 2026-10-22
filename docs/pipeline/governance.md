# Decision rights

Who may accept what in this pipeline. Reviewer agents check decisions against this page.

## Pipeline agents propose; they never accept

The planner, test writer, developer, reviewers and repair agent act as the Claude GitHub App (`claude[bot]`).
They may propose plans, ADRs (status *Proposed*), access changes and deviations from a story. They may not
accept them, approve a PR, or merge (PIPE-08). A decision posted by `claude[bot]` is never a person's decision.

## Who accepts

| Decision | Accepted by |
|---|---|
| A plan above low risk, or with open questions (`human:approval-required`) | The platform owner, or their delegate |
| An ADR (01 §4: new object, OWD change, package, integration, MUST exception) | The platform owner, or their delegate |
| A permission or access change the story didn't ask for (DES-01) | The platform owner, or their delegate |
| A PR whose required checks and reviewer agents have all passed | The merge gate (`merge-gate.yml`), which is plain code, not an agent |
| A PR labelled `human:review-wanted` | A person who approves the PR's current commit |
| A fresh repair budget after the 3-attempt limit (`<!-- agent:repair-reset -->` comment, with the reason) | The platform owner, or their delegate |

## The current delegation (proof of concept)

On 2026-10-22 the platform owner delegated these decisions for this repository to the **pipeline maintainer**,
in their words: "PR#25 doesn't need my approval, you do it. I'm not in the loop". The pipeline maintainer is
the Claude Code session that builds and runs this pipeline on the owner's instruction, outside GitHub Actions.

- A delegated decision counts only when it is posted from the owner's account, **`wrenscience`**, and says
  it is made under this delegation. Comments from `claude[bot]` never count.
- The delegate records each decision on the story's issue: what was accepted, the rule IDs, and why. The
  owner can read, reverse or reopen any of them.
- **Scope:** this demo repository and its sandboxes only. It does not cover production or any other
  organisation's orgs.
- The owner can revoke the delegation at any time by editing this page.

For a real team, replace this section with named roles (for example a solution architect for ADRs and
access, and a product owner for plans). The rules above stay as they are.
