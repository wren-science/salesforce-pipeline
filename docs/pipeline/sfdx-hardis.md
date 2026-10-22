# sfdx-hardis: the release engine (replacing Gearset)

[sfdx-hardis](https://sfdx-hardis.cloudity.com/) is a free, open-source Salesforce CLI plugin from
Cloudity. Gearset is a hosted product you click through. sfdx-hardis gives you the same jobs as CLI
commands, run from GitHub Actions, with Git as the single source of truth. Every deployment is a pull
request merged between long-lived branches, and each branch maps to one org.

## Gearset feature → sfdx-hardis equivalent

| You did this in Gearset | In this repo with sfdx-hardis |
| --- | --- |
| Compare an org with Git and pick components | `sf hardis work save` builds the diff from your scratch org or sandbox and updates `manifest/package.xml`. Agents commit source directly. |
| Validate a deployment | `sf hardis project deploy smart --check` in the PR workflow (`check-deploy.yml`): a check-only deploy plus Apex tests against the target branch's org. |
| Deploy | Merge the PR. `process-deploy.yml` runs `sf hardis project deploy smart` against the org mapped to the target branch. |
| Delta deployments | sfdx-hardis deploys only what changed between commits (delta mode, configured in Phase 1). |
| Deployment pipelines (env promotion) | Long-lived branches: `integration` → `qa` (→ `main`, disabled). Each branch has `config/branches/.sfdx-hardis.<branch>.yml`. |
| Problem analyzers and "fix this" hints | sfdx-hardis wraps deploy errors with tips to solve them, and auto-cleans with `autoCleanTypes` in `.sfdx-hardis.yml`. |
| Protect metadata from being overwritten | `manifest/package-no-overwrite.xml` lists metadata that is deployed only if it doesn't exist in the target. |
| Org monitoring and metadata backups | `sf hardis org monitor all` and `sf hardis org monitor backup` on a schedule (optional, later). |
| Data deployments | `sf hardis org configure data` with SFDMU workspaces (optional, later). |
| Release notes | `sf hardis doc release-notes`. |

## Files you'll see

| File | Purpose |
| --- | --- |
| `.sfdx-hardis.yml` | Project settings: name, development branch (`integration`), auto-clean types |
| `config/branches/.sfdx-hardis.<branch>.yml` | Per-branch target org: instance URL, username, test level (added in Phase 1) |
| `manifest/package.xml` | What gets deployed; grows as stories add metadata |
| `manifest/package-no-overwrite.xml` | Metadata never overwritten in the target |
| `config/project-scratch-def.json` | Shape of the per-agent scratch org (plain Enterprise, no NPSP) |
| `.github/hardis-templates/*.yml` | sfdx-hardis's stock GitHub workflows, parked until Phase 1 so PRs don't fail before secrets exist |

## Authentication

CI logs in with the JWT bearer flow, one certificate per org. sfdx-hardis looks for these GitHub
secrets, named after the **branch** (upper case):

| Secret | Value |
| --- | --- |
| `SFDX_CLIENT_ID_<BRANCH>` | Consumer key of the External Client App in that org |
| `SFDX_CLIENT_KEY_<BRANCH>` | Encryption key for the certificate's private key, from `sf hardis project configure auth` |

`sf hardis project configure auth` generates the certificate, writes the branch config and tells you
which secrets to add. Phase 1 runs it for `qa` and `integration`.

## Daily commands

```bash
sf hardis work new        # start a task: branch + scratch org or sandbox
sf hardis work save       # pull changes, clean, update package.xml, commit
sf hardis project deploy smart --check --target-org <alias>   # validate locally
sf hardis doctor          # explain an error
```

Agents use the same commands inside GitHub Actions.
