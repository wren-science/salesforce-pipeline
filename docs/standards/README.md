# Solution Design and Build Standards

> Migrated in full from the *Solution Design and Build Standards* artefact (README and documents 01–16, as of 15 October 2026). The text is unchanged. These rule IDs are canonical: agents and reviewers cite them. Pipeline-specific rules that supplement them are in [docs/pipeline/rules.md](../pipeline/rules.md).

**Status:** Draft v0.1 · **Owner:** Platform Architecture · **Applies to:** all Salesforce delivery, every value stream, internal teams, partners and AI coding agents **Platform baseline:** API v67.0 · Trigger Actions Framework (TAF) · Nebula Logger 4.16+

These standards define how solutions on the Salesforce platform are designed, built, tested and reviewed. They are binding on every change that reaches a shared environment. Each rule has an ID so that design reviews, PR reviews and coding agents can cite it.

## Documents

| # | Document | Covers |
| --- | --- | --- |
| 01 | [Design principles and decision records](01-design-principles.md) | Persona-first design, platform-first ladder, justification and ADRs, naming, configuration storage |
| 02 | [Automation: Flow vs Apex](02-automation-flow-vs-apex.md) | Decision matrix, where Flow is allowed, where it is prohibited |
| 03 | [Trigger Actions Framework](03-trigger-actions-framework.md) | Trigger template, metadata, actions, bypass, recursion, flow actions, finalizers |
| 04 | [Apex coding standards](04-apex-coding-standards.md) | Bulkification, limits, SOQL/DML, security, exceptions, style |
| 05 | [Apex design patterns](05-apex-design-patterns.md) | Layering, interfaces, abstract/virtual classes, dependency injection, selectors, unit of work |
| 06 | [Testing and mocking](06-testing-and-mocking.md) | Test pyramid, data factories, Stub API, DML-less tests, persona tests, coverage |
| 07 | [Logging and error handling](07-logging-and-error-handling.md) | Nebula Logger usage, scenarios, tags, async linking, retention |
| 08 | [Sharing and record access](08-sharing-and-record-access.md) | Public-group-driven sharing, OWD, Apex managed sharing, performance |
| 09 | [Data model](09-data-model.md) | Standard-first, justification for new objects/fields, field design, relationships |
| 10 | [Large data volumes](10-large-data-volumes.md) | Selectivity, indexes, skinny tables, skew, current volumes |
| 11 | [Integration and External Client Apps](11-integration-and-external-client-apps.md) | Inbound ECAs, integration users, OAuth flows, outbound Named Credentials, patterns |
| 12 | [Asynchronous processing](12-asynchronous-processing.md) | Queueable, Batch, Schedulable, cursors, platform events, scheduler registry |
| 13 | [Data retention and purge](13-data-retention-and-purge.md) | Metadata-driven generic purge engine, archive options, guardrails |
| 14 | [LWC and UI](14-lwc-and-ui.md) | LWC standards, Apex controllers, Lightning Data Service, UI security |
| 15 | [Quality gates](15-quality-gates.md) | Blocking checks per stage, Code Analyzer rules, Definition of Done. Lifecycle and deployment: see the DevOps / ALM documentation. |
| 16 | [Code review checklist](16-code-review-checklist.md) | Consolidated, agent-readable PR checklist referencing every rule ID |

## How to read these standards

Keywords follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119):

| Keyword | Meaning |
| --- | --- |
| **MUST** / **MUST NOT** | Mandatory. A breach blocks the PR. Exceptions need an approved ADR (see [01 §4](01-design-principles.md#4-justification-and-architecture-decision-records)). |
| **SHOULD** / **SHOULD NOT** | Default expectation. Deviations need a written reason in the PR description. |
| **MAY** | Optional. Use judgement. |

Rule IDs take the form `<AREA>-<NN>`, for example `APX-07`. Areas:

| Prefix | Area | Prefix | Area |
| --- | --- | --- | --- |
| DES | Design principles | LDV | Large data volumes |
| AUT | Automation choice | INT | Integration |
| TAF | Trigger Actions Framework | ASY | Async processing |
| APX | Apex coding | RET | Retention and purge |
| PAT | Apex design patterns | UI | LWC and UI |
| TST | Testing | QG | Quality gates |
| LOG | Logging and errors | SHR | Sharing |
| DM | Data model |  |  |

## Guidance for AI coding and review agents

-   Load this README, [16-code-review-checklist.md](16-code-review-checklist.md) and the documents relevant to the changed file types before reviewing or generating code.
-   Cite rule IDs in every review comment, e.g. `APX-03: SOQL inside loop at AccountService.cls:42`.
-   Treat **MUST** breaches as blocking. Report **SHOULD** breaches as non-blocking unless the PR description justifies them.
-   Code samples in these documents are illustrative. Adapt names to the change. Do not copy them into `force-app/` unchanged.
-   When a rule conflicts with existing code in the org, follow the rule for new and changed code. Existing code is brought into line when it is next touched (boy-scout rule, [DES-10](01-design-principles.md)).

## Related documents

| Document | Relationship |
| --- | --- |
| Persona Access Strategy *(not in this repo: `reports/persona-access-strategy.md`)* | Strategic positions that [01](01-design-principles.md) and [08](08-sharing-and-record-access.md) implement |
| User Security Model Standard *(not in this repo: `reports/user-security-model-standard.md`)* | Persona, permission set and integration user conventions. These standards defer to it on persona construction. |
| Security Strategy *(not in this repo: `reports/security-strategy.md`)* | Security intent |
| TAF migration approach *(not in this repo: `reports/trigger-action-framework-migration.md`)* | How existing automation moves onto TAF |

## Reference sources

-   Salesforce Well-Architected: [architect.salesforce.com/well-architected](https://architect.salesforce.com/well-architected/overview) (Trusted · Easy · Adaptable)
-   Salesforce Architects decision guides: Record-Triggered Automation, Asynchronous Processing, Data Integration
-   [Apex Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/) and [Best Practices for Deployments with Large Data Volumes](https://developer.salesforce.com/docs/atlas.en-us.salesforce_large_data_volumes_bp.meta/salesforce_large_data_volumes_bp/)
-   [Trigger Actions Framework](https://github.com/mitchspano/apex-trigger-actions-framework) (Mitch Spano)
-   [Nebula Logger](https://github.com/jongpie/NebulaLogger) (Jonathan Gillespie)
-   [Architecting Inbound Governance with External Client Apps](https://www.salesforce.com/blog/architecting-inbound-governance-external-client-apps/)
-   [Apex Recipes](https://github.com/trailheadapps/apex-recipes) sample app, used as a pattern reference
