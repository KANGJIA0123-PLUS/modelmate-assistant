---
name: modelmate-observability
description: Use when adding OpenTelemetry, metrics, traces, logs, or Claude Code telemetry environment variables.
---

Telemetry must be optional and no-op when disabled. Do not emit full prompts, answers, code snippets, secrets, or absolute paths. Avoid console exporters because Claude Code stream-json stdout must stay clean. Add spans for request, queue.wait, skill.match, claude.spawn, and history.write.
