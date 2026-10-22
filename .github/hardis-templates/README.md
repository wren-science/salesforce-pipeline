# sfdx-hardis workflow templates (inactive)

These are sfdx-hardis's stock GitHub workflows, copied unchanged from the plugin's defaults. They sit
here, outside `.github/workflows/`, so they don't run, and fail, before the Salesforce secrets exist.

Phase 1 moves the ones we need into `.github/workflows/`, trims their branch lists to `integration`
and `qa`, and adds the `SFDX_CLIENT_ID_<BRANCH>` / `SFDX_CLIENT_KEY_<BRANCH>` secrets.

| File | Does |
| --- | --- |
| `check-deploy.yml` | On a PR: check-only deploy and tests against the target branch's org |
| `process-deploy.yml` | On merge: deploy to the target branch's org |
| `megalinter.yml` | Lints the repo |
| `scratch-pool-refresh.yml` | Keeps a pool of ready scratch orgs (optional) |
