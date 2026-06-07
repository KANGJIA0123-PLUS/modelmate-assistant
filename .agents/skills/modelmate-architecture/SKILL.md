---
name: modelmate-architecture
description: Use when changing overall architecture, version isolation, Claude Code runner boundaries, or deciding whether to add new infrastructure.
---

This project is an internal Web knowledge assistant powered by Claude Code. Keep Node Gateway focused on governance: version isolation, queueing, rate limits, history analytics, skills, and observability. Do not build a full RAG platform unless explicitly requested. Every ask request must be scoped to one versionId and must never mix sourceDirs across versions.
