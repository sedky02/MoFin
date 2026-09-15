# MoFin — Technical Audit (2026-09-13)

Full repository audit of `backend/` and `frontend/web/` at commit `5fc393e`.

| File | Contents |
|---|---|
| [00-EXECUTIVE-SUMMARY.md](00-EXECUTIVE-SUMMARY.md) | **Start here.** Verdict, top 10 problems, production-readiness scorecard |
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | How the system works: architecture, data flows, technology assessment |
| [02-FINDINGS.md](02-FINDINGS.md) | All 40 findings, prioritized, with location, evidence, impact and fix |
| [03-SECURITY.md](03-SECURITY.md) | Security findings with attack scenarios — and what was checked and found fine |
| [04-CROSS-CUTTING.md](04-CROSS-CUTTING.md) | Problems only visible across the whole system |
| [05-ROADMAP.md](05-ROADMAP.md) | Debt triage and a phased fix order with rationale |
| [06-ARCHITECTURE-AND-DATA-MODEL.md](06-ARCHITECTURE-AND-DATA-MODEL.md) | Logical architecture & DB design review — workflows and data model only, not code quality |

**Method:** static analysis of every source, config, schema, migration and test file, tracing flows frontend → BFF → backend → database. The application was not executed and no tests were run; items marked *(uncertain)* were not verified at runtime.

**Three things to fix before anything else:** SEC-01 (cross-user token leak in the BFF proxy), SEC-02 (placeholder JWT secrets in the live environment), DATA-01 (draft approval discards the user's corrections).
