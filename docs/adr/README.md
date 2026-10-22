# Architecture Decision Records

Decisions the standards say need an ADR before build (`docs/standards/01-design-principles.md` §4): a new
custom object (DM-01), a TAF Flow action (AUT-04), an OWD or non-group sharing change (SHR-02), a new
integration or External Client App (INT-01), a new scheduled job (ASY-08), a new package dependency
(DES-12), or any exception to a MUST rule.

Name each one `NNNN-<slug>.md`, copying `0000-template.md`. Agents may propose an ADR (status Proposed);
a person accepts it. Link the ADR from the story and the PR.

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-platform-packages.md) | Trigger Actions Framework and Nebula Logger as unlocked platform packages | Accepted |
