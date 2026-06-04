# MoFin

MoFin — AI-native personal finance system for tracking, analyzing, and managing your money through structured data and natural language.

---

## Overview

MoFin is a personal finance operating system designed to go beyond traditional expense trackers. It combines a structured financial ledger with AI-driven automation and MCP integration, allowing users to manage their finances using natural language through AI assistants like ChatGPT, Gemini, and Claude.

The goal is simple:

> You talk to AI → your finances get updated safely and correctly.

---

## Key Features

### Core Finance System
- Multi-account support (cash, bank, savings, etc.)
- Income, expense, and transfer tracking
- Category-based organization
- Transaction history with full audit trail

### AI-Native Experience
- Natural language expense tracking
- AI-powered transaction parsing
- Draft-based validation system for safety
- Structured conversion from text → financial data

### Safety Layer
- Draft transactions before confirmation
- User approval required before committing financial data
- Immutable ledger design

### Analytics & Insights
- Monthly income and expense reports
- Category-based spending analysis
- Savings rate tracking
- Financial history visualization

### MCP Integration
- Exposes tools for AI agents
- Compatible with ChatGPT, Gemini, Claude, and MCP clients
- Secure API-based financial operations

---

## Architecture

MoFin is built as a modular monolith backend with a clear separation of concerns.

### Backend
- NestJS (TypeScript)
- PostgreSQL (primary database)
- Prisma ORM
- Redis + BullMQ (queues & caching)

### AI Layer
- AI module for natural language parsing
- Draft transaction generation system

### MCP Layer
- Tool-based API for AI agents
- Controlled access to financial operations
- Safe execution through service layer only

---

## Core Concept: Draft Transactions

MoFin introduces a safety-first financial model:

1. User or AI submits input
2. System creates a **draft transaction**
3. User reviews and approves
4. Final transaction is recorded in the ledger

This prevents incorrect or hallucinated financial data from being saved.
