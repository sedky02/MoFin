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
