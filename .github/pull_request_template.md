Closes #

## What changed

<!-- One or two sentences. List each metadata item added, changed or deleted. -->

## Personas affected (DES-01, QG-02)

| Persona | Capability change (permission set) | Visibility change (sharing) |
| --- | --- | --- |
| | | |

## Rules cited

| Rule | How it applies |
| --- | --- |
| | |

## ADRs (01 §4)

<!-- Link each ADR in docs/adr/, or write "None needed". -->

## Acceptance criteria → evidence

| Criterion | Persona | Test | Result |
| --- | --- | --- | --- |
| AC1 | | | |

The pipeline adds the full evidence table (tests, personas, screenshots, video) as a comment on this PR.

## Checklist

- [ ] Code under test runs as a persona in every test (TST-16, TST-17), with a denial test (TST-03)
- [ ] New or changed objects and fields have description, help text and data classification (DM-03, QG-07)
- [ ] Deploys to a plain scratch org: no NPSP dependencies (PIPE-04)
- [ ] No secrets in the diff (QG-08)
- [ ] Destructive changes are in their own PR with an ADR (QG-09)
- [ ] `.agent/<issue>/handover.json` updated (PIPE-06)
