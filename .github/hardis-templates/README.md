# sfdx-hardis workflow templates (reference only)

sfdx-hardis's stock GitHub workflows, copied unchanged from the plugin's defaults. They are not used.
This repo runs its own workflows in `.github/workflows/` (see `docs/pipeline/ci.md`), which call the same
sfdx-hardis commands but keep the QA login away from code on PR branches and run only this repo's
tests. Keep these for comparison when upgrading sfdx-hardis.
