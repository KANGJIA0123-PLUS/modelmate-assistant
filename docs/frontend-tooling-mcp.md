# Frontend MCP / Skill / Plugin Guide

## Why this project needs frontend tooling

Modelmate is still a vanilla HTML/CSS/JS frontend, and the next UI work will focus on a more polished workspace rather than a framework rewrite. Browser automation, current documentation lookup, design context, and local debugging tools can raise UI quality without changing the architecture.

The goal is to make visual work more observable: check layout, click flows, console errors, responsive states, and accessibility signals before claiming the UI is ready.

## Recommended stack

### Context7 MCP / Skill

Use Context7 to fetch current library and platform documentation, reducing outdated API assumptions and hallucinated configuration.

Use it for TypeScript, Supabase, Playwright, CSS, browser APIs, and any future library that is explicitly approved.

Recommendation: first priority.

### Playwright MCP

Use Playwright MCP for browser automation, local page navigation, clicking, typing, screenshots, and accessibility-tree inspection.

Use it for three-column layout acceptance, chat input smoke checks, insights tabs, reports panel checks, and mobile viewport smoke checks.

Recommendation: first priority.

### Chrome DevTools MCP

Use Chrome DevTools MCP for console, network, performance trace, and DOM debugging.

Use it after UI changes to diagnose CSS overflow, console errors, layout shifts, and performance issues.

Recommendation: second priority.

### Figma MCP

Use Figma MCP only when there is an approved Figma design file. It can provide variables, components, and layout context for turning a design system into CSS and vanilla frontend structure.

Recommendation: enable only when a formal design file exists and only for authorized files.

### shadcn MCP

shadcn MCP 暂不启用.

It is useful for browsing, searching, and installing shadcn registry components, but this project is not a React/shadcn architecture. Enabling it now would pull the project toward a component-library migration, which conflicts with the current vanilla frontend and small-step migration strategy.

## Recommended adoption order

Phase 1: Context7 + Playwright MCP.

Phase 2: Chrome DevTools MCP.

Phase 3: Figma MCP.

Hold: shadcn MCP, Storybook, React component libraries.

## Example local setup commands

These commands are local configuration examples only. Codex must not run them automatically, and real local MCP configuration must not be committed.

Context7 example:

```bash
npx ctx7 setup
```

Playwright MCP example:

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

Chrome DevTools MCP example:

```bash
claude mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

shadcn MCP:

Do not enable it by default. Re-evaluate only if a later task explicitly moves the frontend to React/shadcn.

Figma MCP:

Follow the official Figma MCP documentation for local setup. Do not write a Figma token into this repository.

## How Codex should use these tools

Before a UI redesign:

1. Read this document.
2. Use Context7 for current library, browser, CSS, and tooling docs when a task depends on external APIs.
3. Do not install new dependencies unless a later task explicitly asks for them.
4. Do not skip the frontend safety tests.

During a UI redesign:

1. After changing CSS or HTML, use Playwright MCP against the local dev server when available.
2. Check desktop, narrow, and mobile viewport behavior.
3. Check the chat input and view switcher.
4. Check for console errors.
5. Capture screenshots or browser observations for visible layout issues.

After a UI redesign:

1. Run `npm run typecheck`.
2. Run `npm run check`.
3. Run `npm test`.
4. If available, use Playwright MCP or Chrome DevTools MCP for a local browser smoke check.

## Security rules

1. 不要提交真实 MCP 配置。
2. 不要提交 token。
3. 不要使用生产后台数据。
4. Do not let MCP tools access `SUPABASE_SERVICE_ROLE_KEY` or any service role key.
5. Do not write `serviceRoleKey`, `orgId`, or token fields into public frontend files.
6. Playwright/Chrome DevTools MCP 只用于本地开发页面.
7. `browser_run_code_unsafe` or equivalent browser code execution is allowed only in trusted local development environments.
8. shadcn MCP remains disabled unless a later task explicitly approves it.
