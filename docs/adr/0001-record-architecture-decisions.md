# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The Reqs-AI frontend makes several non-obvious architectural choices (framework version, change
detection strategy, state management, UI library, testing tools). New contributors and instructors
need to understand not just *what* the architecture is, but *why* each decision was made, and under
what constraints.

## Decision

We will use **Architecture Decision Records (ADRs)** following Michael Nygard's format, stored in
`docs/adr/` and numbered sequentially. The architecture *overview* (current state) lives in the
`README.md` and `CONTRIBUTING.md`; the *rationale* (the decisions) lives here. ADRs are immutable;
a decision is changed by adding a new ADR that supersedes the previous one.

## Consequences

- The reasoning behind the design is preserved and reviewable, independent of who is on the team.
- A small ongoing cost: each significant decision requires writing a short ADR.
- The README/CONTRIBUTING describe "how it works now"; ADRs describe "why we chose it".
