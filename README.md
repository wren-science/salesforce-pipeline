# salesforce-pipeline

A proof of concept for agentic Salesforce delivery. Claude Code agents take a GitHub issue to a QA
sandbox. sfdx-hardis handles the release mechanics, and people approve three gates on the way. The
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

```
Issue (story template) ──label agent:plan──▶ Planner posts plan
        │
   Gate 1: human adds agent:approved
        ▼
Scratch org ──▶ Developer agent ──▶ draft PR ──▶ Validate (sfdx-hardis check deploy, tests, scans)
                                                   │ fail: repair agent, max 3 tries
                                                   ▼
                                     Reviewers: architecture · security · tests
                                                   │ blocking: rework, max 2 rounds
                                                   ▼
                                     Gate 2: human approves PR ──▶ merge to integration
                                                   ▼
                                     Release agent: QA promotion PR + evidence pack
                                                   ▼
                                     Gate 3: GitHub Environment "qa" approval ──▶ deploy to QA sandbox
```

Details: [docs/pipeline/architecture.md](docs/pipeline/architecture.md).

## Branches and environments

| Branch | Environment |
| --- | --- |
| `feature/*` | One scratch org per agent task |
| `integration` (default) | Validated against QA |
| `qa` | The QA sandbox |
| `main` | Reserved for production; deployment disabled |

## Where things are

| Path | What |
| --- | --- |
| [`docs/standards/`](docs/standards/README.md) | Canonical engineering standards, each with a stable ID that agents cite |
| [`docs/pipeline/`](docs/pipeline/) | Architecture, gates, handover protocol, sfdx-hardis guide |
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
| 0. Bootstrap: project, standards, docs | Done |
| 1. Pipeline without AI | In progress |
| 2. Planner and reviewers | Not started |
| 3. Autonomous development | Not started |
| 4. Release to QA | Not started |
| 5. Demo run | Not started |

## Security

This repo is public. Issue and pull request text is treated as untrusted data. Agents start only on
label events, which need triage access, and never because someone opened an issue or mentioned a bot.
Credentials live only in GitHub Secrets and Environments.
