# AGENTS.md - Modelmate 辅助运营知识助手

## 项目定位

这是一个内部 Web 版 Claude Code 知识助手。Node.js 服务负责 Web 接入、版本隔离、队列限流、历史统计、Skill 编排和 OpenTelemetry；Claude Code 负责读取当前版本知识库和代码并生成回答。

## 必须遵守

- 暂不做登录、鉴权、SSO、RBAC。
- 不要把前端重写成 React/Vue，也不要改成 TypeScript。
- 不要重造复杂 RAG 平台；默认使用 Claude Code 的只读工具检索当前版本目录。
- 每个问答请求必须携带 versionId。
- 不要跨版本读取知识库或代码。
- 默认只允许 Claude Code 使用 Read / Glob / Grep / LS。
- 禁止 Edit / MultiEdit / Write / NotebookEdit / Bash / WebFetch / WebSearch。
- 不要在 /api/config 或 /api/versions 中暴露本机绝对路径。
- 暂不实现 Eval。
- 路径处理必须跨平台，使用 node:path，不要硬编码 `/`。

## 开发习惯

- 优先小步修改，避免一次性大重写。
- 修改后运行 `npm run check`。
- 新增测试后运行 `npm test`。
- 新增 `.mjs` 文件后，把它加入 `package.json` 的 check 脚本，或改造成自动检查所有 src/scripts/test 文件。
- 遥测中不要记录完整问题、完整回答、代码片段、绝对路径和敏感信息。

## 当前推荐任务顺序

1. 静态文件路径校验修复。
2. 配置模型升级为 versions。
3. 版本注册中心和 /api/versions。
4. 前端版本选择。
5. Claude Runner 版本化只读调用。
6. 队列、限流、取消。
7. SQLite 历史、高频、分类统计。
8. Skill 中心。
9. OpenTelemetry。
10. 多平台 doctor 和文档。
