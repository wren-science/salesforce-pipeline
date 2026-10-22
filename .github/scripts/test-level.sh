#!/bin/bash
# Prints the sfdx-hardis test level for a deploy or validation.
# QA also holds Apex from other projects, so we only ever run this repo's tests:
# RunRepositoryTests when force-app has Apex test classes, otherwise NoTestRun
# (sfdx-hardis would otherwise fall back to RunLocalTests and run everyone's tests).
set -euo pipefail
if grep -rlqi --include='*.cls' '@istest' force-app 2>/dev/null; then
  echo RunRepositoryTests
else
  echo NoTestRun
fi
