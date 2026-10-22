# CI workflows (Phase 1: pipeline without AI)

| Workflow | Runs on | Secrets | Does |
| --- | --- | --- | --- |
| `pr-checks.yml` | Every PR into `integration` or `qa` | None | NPSP-dependency check (`NPO-META-002`), credential scan (`NPO-SEC-003`), Salesforce Code Analyzer (`NPO-APEX-010`) |
| `validate-qa.yml` | When PR checks finish (same-repo PRs only) | `qa-validate` environment | sfdx-hardis check-only deploy of the PR's `force-app` to QA; posts the `validate/qa` status on the PR |
| `deploy-qa.yml` | Push to `qa` (a merged promotion PR) | `qa` environment, needs a maintainer's approval (Gate 3) | sfdx-hardis deploy to QA |
| `publish-wiki.yml` | Push to `integration` touching `docs/` | None | Regenerates the wiki |

## Why validation is split in two

A pull request can change any file, including workflows. If the QA login were available to a
workflow that runs from the PR, the PR could print it. So `pr-checks.yml` (from the PR) gets no
secrets, and `validate-qa.yml` runs from `integration`'s copy of itself after `pr-checks.yml` passes.
It takes only `force-app/` and `manifest/` from the PR; config and scripts come from `integration`.
PRs from forks never reach it.

## Which tests run

QA also holds Apex from other projects, so we never run all local tests there.
`.github/scripts/test-level.sh` picks `RunRepositoryTests` when `force-app` has Apex test classes
(only this repo's tests run), and `NoTestRun` when it has none.

## Environments

| Environment | Branches allowed | Approval | Holds |
| --- | --- | --- | --- |
| `qa-validate` | `integration` (where `validate-qa.yml` runs) | None | `SFDX_CLIENT_ID_INTEGRATION`, `SFDX_CLIENT_CERT_INTEGRATION`, `TARGET_USERNAME`, `INSTANCE_URL` |
| `qa` | `qa` | Maintainer (Gate 3) | `SFDX_CLIENT_ID_QA`, `SFDX_CLIENT_CERT_QA`, `TARGET_USERNAME`, `INSTANCE_URL` |
| `devhub` | `integration` | None | `SFDX_AUTH_URL_DEV_HUB` (Phase 3 provisioner) |

## Tool versions

Pinned in `.github/actions/setup-sf/action.yml`: Salesforce CLI 2.154.4, sfdx-hardis 8.15.0, Code
Analyzer 5.16.0. Bump them deliberately, in their own PR.
