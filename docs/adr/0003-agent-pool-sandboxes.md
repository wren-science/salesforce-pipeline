# ADR-0003: Agents and PR tests work in a pool of source-tracked Developer sandboxes

- Status: Accepted
- Date: 2026-10-22
- Deciders: Platform owner (approved the switch, sandbox source tracking and three sandboxes on 2026-10-22); pipeline maintainer
- Rules affected: PIPE-01, PIPE-04, PIPE-09, PIPE-10, PIPE-11, PIPE-14, TST-11, TST-16

## Context
Development and testing have to happen in a prod-like environment. The real target is a complex multi-cloud
org: Education Cloud, Sales Cloud, Service Cloud, managed packages, and years of configuration. Until now,
every agent and every PR worked in a fresh scratch org: plain Enterprise, no NPSP, none of the org's
configuration. That caused three problems:

- Defects that only show in the real org surfaced late, at the check-only deploy to QA. Story #20 is the
  example: a list-view test that passed in scratch failed in QA.
- PIPE-04 forbade referencing NPSP, which a real org can't avoid.
- Plans were steered away from the platform's own objects. For #4, the planner ruled out Education Cloud's
  `LearningProgram` because a scratch org doesn't have it.

sfdx-hardis's setup guide assumes source-tracked Developer sandboxes cloned from the integration org, with
scratch orgs as an option (`USE_SCRATCH_ORGS` is off by default on GitHub). Salesforce describes sandboxes as
carrying production's metadata with no extra configuration, where scratch orgs start empty. Both need a
licence, and Developer sandboxes can be refreshed once a day.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| 1. Scratch org per run (status quo) | Fast (about 2 min plus 2.5 min of packages), isolated, disposable | Not prod-like; NPSP and Education Cloud absent; PIPE-04; QA-only defects found late |
| 2. Scratch orgs from a snapshot or org shape | Faster; carries features and settings | Still no org configuration or managed-package data model; shape doesn't copy packages |
| 3. **Pool of source-tracked Developer sandboxes, leased per story** | Prod-like (packages, configuration, other code); source tracking for the agents; the pool size caps work in progress | Licences (the org allows 2 Developer Pro); creation takes hours; refresh once a day; sandboxes persist, so credentials need care |
| 4. One shared Developer sandbox for every PR | One licence | Stories collide; no parallel work streams |

## Decision
Option 3.

- **The pool.** `config/sandbox-pool.json` lists `agent1` (Developer Pro, cloned from the QA sandbox) and
  `agent2`, `agent3` (Developer, copied from production; Developer Pro licences ran out). Sandbox source
  tracking is enabled in production.
- **Leases.** A story leases a sandbox when its build starts (`sandbox-lease.mjs`; a `sandbox:<name>` label on
  the issue) and keeps it through PR tests and repair until the merge gate merges it, or a person closes it
  (`sandbox-release.yml`). Other PRs lease their own. When the pool is full, the work waits (`agent:queued`, or
  a pending `tests/personas`), and the merge gate re-runs it when a sandbox frees up.
- **Every lease starts from integration.** The first job of a lease installs the platform packages, deploys
  integration's `force-app`, and prepares the persona users. Where a sandbox was copied from doesn't matter.
  It doesn't need a refresh between stories, because a merged story leaves it at integration plus that story.
- **Credentials.** Each pool sandbox has its own JWT certificate on the pipeline External Client App
  (`sandbox-setup/prepare-pool-sandbox.sh`), so no QA or production key opens it. Only the trusted lease job
  (environment `sandbox-pool`) holds that key. Agents and PR code get short-lived access tokens, for the admin
  and each persona, encrypted in transit, and the tokens are revoked at the end of the job.
- **Persona MFA.** Each lease clears the persona's registered authenticator (`personas.mjs --reset-mfa`), and
  Playwright registers a fresh one. No MFA secret is kept per sandbox.
- **Tests.** Only this repo's Apex test classes run (`--class-names`), because the sandbox also holds the
  org's other code. `tests/personas` replaces `tests/scratch`. `validate/qa` is unchanged.
- **Safety on copies.** Preparation deactivates copied users other than the admin and aborts scheduled jobs.
  It lists named credentials so that nothing calls live systems.

## Consequences
- Development and tests now run against the real data model and packages, including NPSP here, and
  Education Cloud and Service Cloud in a GU-style org. Once the sandbox flow has run stories end to end,
  PIPE-04 is reviewed and retired.
- **Work in progress is capped at the pool size (3).** More parallel streams need more sandbox licences.
- **Sandboxes drift.** An abandoned story can leave metadata behind, because deploys aren't destructive. A
  nightly refresh of idle sandboxes (once a day, from production or QA) is the follow-up. Until then, every
  lease redeploys integration.
- **Recovery takes hours, not minutes.** A sandbox can't be recreated in minutes, so a broken pool sandbox is
  taken out of `config/sandbox-pool.json` until it is refreshed.
- **Scratch-org support stays for now** (`config/project-scratch-def.json`, `install-packages.mjs`): useful for
  fast, isolated unit-level checks later, and for ISV-style packages.
