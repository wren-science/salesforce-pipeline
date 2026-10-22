# ADR-0001: Trigger Actions Framework and Nebula Logger as platform packages

- Status: Accepted
- Date: 2026-10-22
- Deciders: Platform owner (approved installing both in QA on 2026-10-22); pipeline maintainer
- Rules affected: DES-12, TAF-01, LOG-01, DES-07, APX-30, APX-46, AUT-09

## Context
The standards' platform baseline (README) names the Trigger Actions Framework (TAF) and Nebula Logger
4.16 or later. Every trigger goes through TAF (03), and every entry point logs failures through Nebula
(07, DES-07). Neither was installed in QA or in the scratch orgs. That blocked stories with trigger logic
or Apex logging (#11, #12, #13). DES-12 requires an ADR for any new package dependency.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| 1. No packages: Flow only, `System.debug` | Nothing to install | Breaks TAF-01, LOG-01, APX-46; stories #11–#13 can't meet the standards |
| 2. Copy the frameworks' source into `force-app` | No package installs | We would own and fork upstream code; upgrades become merges; breaks "use as provided" |
| 3. **Install the unlocked packages, without a namespace** | Matches the standards' examples (`TriggerBase`, `Logger`); upstream upgrades are a version-ID change | Each fresh scratch org spends a few minutes installing them |
| 4. Managed Nebula (namespace `Nebula`) | Upgrades are pushed | Lags the unlocked release; code would need `Nebula.Logger`, unlike the standards' examples |

## Decision
Option 3. `config/packages.json` pins the versions:
- Nebula Logger Core 4.19.5 (`04tg7000000IzRdAAK`)
- TAF 0.3.4-1 (`04tKY000000R0yHYAS`)

`scripts/install-packages.mjs` installs whatever is missing. Each workflow's provision job runs it right
after creating a scratch org (PR tests, agent build, agent repair), so agents and tests always get an org
that has the baseline. QA had both installed by hand on 2026-10-22. The higher environments get them the
same way before their first deploy.

## Consequences
- Upgrading a package means changing its version ID in `config/packages.json` (a `pipeline/` PR) and
  installing it in each shared org before merging code that needs the new version.
- Each scratch org takes about 2.5 extra minutes to provision (measured: Nebula 120 s, TAF 23 s). That shows up
  in each story's runner minutes.
  If that matters, a scratch org snapshot with the packages preinstalled would remove it.
- Package objects (`Log__c`, `LogEntry__c`, TAF custom metadata) are used as provided (09). Access to logs
  is granted only through Nebula's permission sets, assigned to support personas (07).
- Rollback: uninstall the packages from the org and remove them from `config/packages.json`. Only safe
  once no code in `force-app` references them.
