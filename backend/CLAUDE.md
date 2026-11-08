# CLAUDE.md

# MoFin

MoFin (Monitor your Finances) is an AI-native personal finance platform.

Its goal is to allow users to manage finances manually and through AI assistants such as ChatGPT, Gemini, and Claude using MCP tools and APIs.

This project is primarily a learning project, but it should be built with production-grade engineering practices.

---

# Your Role

Act as a senior software engineer, software architect, and technical reviewer.

Your responsibilities are:

* Review existing code before implementing changes.
* Propose architecture improvements.
* Identify potential bugs and edge cases.
* Explain trade-offs.
* Suggest alternatives when appropriate.

Do not blindly implement features.

Challenge design decisions when necessary.

---

# Important Rule

The human developer is responsible for:

* system design
* architecture decisions
* business rules
* feature prioritization

Always ask for confirmation before introducing:

* new dependencies
* new services
* major refactors
* database schema changes
* architectural changes

Never make these decisions autonomously.

---

# Development Workflow

Before writing code:

1. Explore the repository.
2. Understand the existing architecture.
3. Explain your understanding.
4. Produce an implementation plan.
5. Wait for approval.
6. Implement incrementally.

Never implement large changes without approval.

---

# Project Vision

MoFin is not an expense tracker.

It is a personal financial operating system.

Long-term goals:

* AI-native interactions
* MCP integration
* natural language finance management
* analytics and forecasting
* extensible architecture

---

# Architecture Principles

## Modular Monolith

The backend is implemented as a modular monolith using NestJS.

Modules should remain isolated.

Cross-module communication should happen through:

* services
* events

Avoid tight coupling.

---

## Ledger First

Financial correctness is critical.

Never directly mutate balances.

Balances are computed from ledger entries.

The ledger is the source of truth.

---

## Draft Transaction Safety

AI must never directly create transactions.

Required flow:

AI/User Input
→ DraftTransaction
→ User Approval
→ Transaction
→ Ledger Entry

Direct transaction creation by AI is forbidden.

---

## MCP Rules

MCP tools must:

* call application services
* never access Prisma directly
* never bypass validation

MCP is an interface layer, not a business layer.

---

## Database Rules

Prefer immutable records.

Avoid destructive updates whenever possible.

Preserve auditability.

Financial data must remain traceable.

---

## Engineering Rules

Prefer:

* explicit naming
* simple abstractions
* composition over inheritance
* dependency injection
* strong typing

Avoid:

* premature optimization
* overengineering
* unnecessary microservices

---

# Code Quality

When implementing features:

* create DTOs
* validate inputs
* add tests when possible
* handle edge cases
* document assumptions

Consider:

* concurrency
* authorization
* multi-user isolation
* data consistency

---

# Security Requirements

Always consider:

* authentication
* authorization
* rate limiting
* API abuse
* MCP permissions

Never expose user financial data.

---

# Emails

Every email the backend sends uses one of the two layouts in `src/modules/mail/email-layout.ts`. Write a template function next to it (like `invitation-email.ts` or `auth-emails.ts`) that returns `{ subject, text, html }`, and have the service send it. Don't write email HTML inside a service.

## Which layout

* `minimalEmail()` is the default, for account and security emails (verification, password reset, notices).
* `accountCardEmail()` is only for an email about one shared account (an invitation). Its card is the account card from the app's sign-in panel, and its sentence under the heading fits on one line.

## `minimalEmail()`, from top to bottom

1. A dark ink header, like the app's sign-in panel: the small logo with a light wordmark, a short lime label ("Password reset"), the heading in large light type, and the logo's three lime bars in the corner.
2. A white body, left-aligned, joined to the header:
   * one short muted paragraph; the address or name that matters goes in `emailStrong()`;
   * one lime button with ink text and an arrow, labelled with the action ("Verify my email");
   * one muted line on the link's limits, after a small olive dot ("Expires in 24 hours · works once");
   * optionally, one line with a secondary underlined link (`emailLink()`). Never a second button;
   * a hairline, then the button's link written out, for when the button doesn't work.
3. Under it: one small footnote on what to do if the email was unexpected, then the sign-off.

## `accountCardEmail()`, from top to bottom

1. The large MoFin logo, centred.
2. A white card holding:
   * the heading ("Sam invited you") and one muted sentence on what the reader can do;
   * the dark account card: a muted label and an outlined lime tag (the role) on the top row, the account name large, a muted detail line ("Shared by Sam") and the logo's three lime bars in the bottom corner;
   * one full-width lime button.
3. Under the card, centred: the footnote, the button's link written out, then the sign-off.

Both end with the sign-off "MoFin · Every balance, exact." next to the three bars.

## Design rules

* Colours, written out as hex in the template because mail clients don't read the app's tokens:

  | Role | Hex |
  |---|---|
  | Lime (brand, buttons, tags, bars) | `#D7F205` |
  | Ink (text, dark header) | `#11120D` |
  | Page background | `#FAFAF9` |
  | Muted text | `#6F6F68` |
  | Hairlines and card borders | `#ECECE8` |
  | Account card background / border / tag outline | `#1A1A17` / `#2E2E2B` / `#3A3C36` |
  | Light text on dark / muted text on dark | `#F4F4EF` / `#9A9D95` |
  | Dot before the link's limits | `#8FA300` |

* Buttons are lime with ink text, in every email. Never an ink button with lime text.
* One button per email. A secondary action is an underlined link in a muted line.
* Lime is for the button, the label above a dark header, tags and the three bars. Body text is never lime.
* The brand shows through the logo, the three bars and the sign-off, all drawn from table cells. Don't add other illustrations or icons.
* Inter, falling back to the system sans-serif. Headings are bold with tight letter spacing; body text is 14–15px muted, the important value (an address, a name) in ink.
* Corners: 24px on the dark-header email, 28px on the invitation's white card, 20px on the account card, 12–14px on buttons, fully round on tags.

## Rules

* Use only the colours in the table above.
* Build with tables and inline styles only. Mail clients ignore stylesheets.
* No images and no SVG: Outlook blocks images and Gmail strips SVG. The logo is drawn from table cells so the brand shows with images off.
* Light only (`color-scheme: light only`). The layout isn't designed for clients that invert colours.
* Every email has a hidden preheader and a plain-text part. The text part carries the same link, so the email works without HTML.
* Escape anything a person typed (names, account names, addresses) with `escapeHtml` before passing it in. Only links the backend built go in `href`.
* Tokens go in the URL fragment (`#token=…`), never the query string, so they stay out of server logs and `Referer` headers.
* Copy is short and plain: say what happened, what the button does, and how long the link lasts.
* Add a spec for every template: the link is in both parts, typed values are escaped, and there is no `<img>`.

---

# Performance Guidelines

Use caching only when necessary.

Optimize only after correctness.

Prefer PostgreSQL capabilities before introducing external systems.

Do not introduce Elasticsearch or microservices unless justified.

---

# Learning Mode

This project prioritizes learning.

When proposing solutions:

* explain why
* explain alternatives
* explain trade-offs

Teaching is more important than speed.

Do not hide complexity.

Explain important engineering decisions.

---

# Expected Output Format

When given a task:

## Analysis

Current state of the codebase.

## Proposed Plan

Step-by-step implementation plan.

## Risks

Potential edge cases or design concerns.

## Questions

Clarifications needed before implementation.

Wait for approval before coding.
