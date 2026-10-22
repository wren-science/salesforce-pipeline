# CI workflows

| Workflow | Runs on | Holds | Does |
| --- | --- | --- | --- |
| `pr-checks.yml` | Every PR into `integration` | Nothing | Metadata checks (DM-03, QG-07), NPSP guard (PIPE-04), `.github/` guard for story branches (PIPE-08), secret scan (QG-08), Code Analyzer v5 (QG-03) |
| `pr-tests.yml` | When PR checks pass (same-repo PRs) | Dev Hub login in `provision`/`cleanup` only | Scratch org per PR, persona users, Apex (`RunLocalTests`) and Playwright as personas (TST-16), evidence comment, status `tests/scratch` |
| `validate-qa.yml` | When PR checks pass (same-repo PRs) | QA check-only login | sfdx-hardis check-only deploy of the PR's `force-app` to QA, status `validate/qa` |
| `deploy-qa.yml` | Every merge to `integration` | QA login | sfdx-hardis deploy to the QA sandbox, persona provisioning by JWT, Playwright regression as personas |
| `publish-wiki.yml` | Push to `integration` touching `docs/` | Nothing | Regenerates the wiki |

## Trust boundaries

A pull request can change any file, so PR code never runs next to a shared login (PIPE-09):

- `pr-checks.yml` runs the PR's own workflow file but has no secrets.
- `pr-tests.yml` and `validate-qa.yml` run from `integration`'s copy of themselves (`workflow_run`). They take only
  `force-app/`, `tests/e2e/specs/` and `config/personas.json` from the PR.
- In `pr-tests.yml` the Dev Hub login lives only in `provision` and `cleanup`, on their own runners. The `work`
  job that runs PR code gets just the throwaway scratch org's login, encrypted in transit
  (`SCRATCH_HANDOFF_KEY`) and deleted after use. Only the trusted `report` job can write statuses and comments.
- Fork PRs never reach the trusted workflows.

## Personas in CI

`scripts/personas.mjs` makes any org persona-ready from `config/personas.json`: the persona's profile, its
permission set group and its persona public group (06 §6.1), then a one-time frontdoor login for Playwright.
Scratch orgs use `sf org create user`; QA uses the data API and a JWT login as the persona (the persona also
holds `Salesforce_Pipeline_CI`, which only pre-authorises the CI app). Each Playwright project is a persona.

## Which tests run

In scratch orgs, all local tests. In QA, which also holds other projects' Apex, `.github/scripts/test-level.sh`
picks `RunRepositoryTests` (this repo's tests only) or `NoTestRun` when there are none.

## Environments

| Environment | Branches | Approval | Holds |
| --- | --- | --- | --- |
| `qa` | `integration` | None (QA is the dev org) | `SFDX_CLIENT_ID_INTEGRATION`, `SFDX_CLIENT_CERT_INTEGRATION`, `TARGET_USERNAME`, `INSTANCE_URL` |
| `qa-validate` | `integration` | None | The same QA login, for check-only validation |
| `devhub` | `integration` | None | `SFDX_AUTH_URL_DEV_HUB` |
| `agents` | `integration` | None | `CLAUDE_CODE_OAUTH_TOKEN` |

## Agent cost and runner minutes per story

Every agent run (planner, test writer, developer, reviewers, repair) adds a row to one comment on the story's
issue, marked `<!-- agent:cost-ledger -->`. Each row shows the run's turns, its tokens (input, output, cache
read, cache write), and its cost in US$ and A$. The heading shows the story's running total. Rows come from
`scripts/agent-report.mjs --json` and are merged by `scripts/cost-ledger.mjs`.

- The rows are stored inside the comment as base64 JSON, and each row is keyed by run, attempt and role, so
  rerunning a job doesn't count it twice.
- Review and repair runs find the story from their `feature/<issue>-` branch.
- The comment also counts the story's **runner minutes**, recounted on every update. The count covers the
  agent runs in the ledger and every run tagged with the story's branch in its run name (PR checks, PR tests,
  QA validation, reviews, repair), plus the QA deploy the merge gate starts for the story. Each job is
  rounded up to the minute and reruns are included, as GitHub bills them. GitHub Enterprise Cloud includes
  50,000 Linux minutes a month; a public repository is not billed for them.
- The cost is Claude Code's `total_cost_usd`, the API list-price equivalent, whatever plan the pipeline
  is billed on. The A$ rate is set in `config/cost.json`. CI runner minutes are not included.
- The report and ledger steps run integration's copies of the scripts (`git show origin/integration:...`),
  not the working tree an agent may have changed, because those steps hold a token that can write.

## Tool versions (PIPE-16)

Salesforce CLI 2.154.4, sfdx-hardis 8.15.0, Code Analyzer 5.16.0 (`.github/actions/setup-sf`); Playwright 1.64.0
and @axe-core/playwright 4.13.0 (`tests/e2e/package.json`).

## Not yet

- **Merge queue:** not used yet; the queue needs every check to also run on `merge_group` events.
- **Delta deployments:** the repo is small, so every deploy sends the full `force-app`. Switch on
  `useDeltaDeployment` when deploys get slow.
