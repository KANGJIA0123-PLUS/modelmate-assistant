---
name: modelmate-node-gateway
description: Use when modifying src/server.mjs, config, routing, queues, rate limits, jobs, or static file serving.
---

Prefer small native Node.js modules. Use node:http and node:path consistently. Keep APIs JSON/NDJSON compatible with the existing frontend. Static paths must be validated with path.relative, never string startsWith. Do not expose absolute local paths in public API responses.
