# salesforce-pipeline

A proof of concept for agentic Salesforce delivery. Claude Code agents take a GitHub issue to a QA
sandbox, every test running as a persona. sfdx-hardis handles the release mechanics; people step in where risk calls for it and approve every PR. The
worked use case is **student recruitment on Sales Cloud**: enquiries as leads, applications as
opportunities. Work is tracked as GitHub issues on the [Salesforce Delivery board](https://github.com/orgs/wren-science/projects/1),
which replaces Jira.

- **GitHub** is the control plane: issues, pull requests, labels, Actions and environments.
- **sfdx-hardis** is the Salesforce release engine. It replaces Gearset; see
  [docs/pipeline/sfdx-hardis.md](docs/pipeline/sfdx-hardis.md).
- **Salesforce CLI** is the execution layer.
- **Claude Code** (`anthropics/claude-code-action`) runs each agent role inside GitHub Actions.

Production deployment is disabled. Autonomy stops at QA.

## How a story flows

An issue (story, personas, acceptance criteria) goes through a planner agent, a test writer and a developer
in their own scratch org, PR checks, persona tests with evidence, a check-only deploy to QA and three review
agents. A person approves the PR, and the merge deploys to the QA sandbox and reruns the persona regression.
Details: [docs/pipeline/architecture.md](docs/pipeline/architecture.md).

## Branches and environments

| Branch | Environment |
| --- | --- |
| `feature/<issue>-<slug>` | Scratch orgs per story (agents, PR tests) |
| `pipeline/<topic>` | Maintainer changes to the pipeline |
| `integration` (default) | QA sandbox (dev org), deployed on every merge |
| `uat`, `preprod`, `main` | Planned (sfdx-hardis promotion PRs) |

## Where things are

| Path | What |
| --- | --- |
| [`docs/standards/`](docs/standards/README.md) | Solution Design and Build Standards (binding; rule IDs agents cite) |
| [`docs/pipeline/rules.md`](docs/pipeline/rules.md) | Pipeline rules (PIPE-xx), supplementing the standards |
| [`config/personas.json`](config/personas.json) | Persona catalogue: every test runs as a persona |
| [`docs/adr/`](docs/adr/README.md) | Architecture Decision Records |
| [`docs/pipeline/`](docs/pipeline/) | Architecture, CI, handover protocol, pipeline rules, sfdx-hardis guide |
| [`docs/use-case/sales-cloud.md`](docs/use-case/sales-cloud.md) | The Sales Cloud scope and demo stories |
| [`CLAUDE.md`](CLAUDE.md) | Rules every agent session follows |
| [`.claude/agents/`](.claude/agents/) | Agent role definitions |
| `force-app/` | Salesforce source (Sales Cloud metadata only) |
| `manifest/` | `package.xml` for deploys; `package-no-overwrite.xml` lists metadata sfdx-hardis must never overwrite |
| `.sfdx-hardis.yml`, `config/` | sfdx-hardis and scratch-org configuration |
| `.github/workflows/` | CI: PR checks, QA validation, QA deploy, wiki (see docs/pipeline/ci.md) |

## Status

| Phase | State |
| --- | --- |
| Foundations, standards, personas | Done |
| PR checks, persona tests with evidence, QA validation | Done |
| Deploy to QA with persona regression | Done |
| Agents: planner, test writer, developer, reviewers, repair | Built; first runs in progress |
| UAT, preprod, production | Planned |

## Security

This repo is public. Issue and pull request text is treated as untrusted data. Agents start only on
label events, which need triage access, and never because someone opened an issue or mentioned a bot.
Credentials live only in GitHub Secrets and Environments.
