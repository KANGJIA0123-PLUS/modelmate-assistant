# AGENTS.md - Modelmate 辅助运营知识助手

## 项目定位

这是一个内部 Web 版 Claude Code 知识助手。Node.js 服务负责 Web 接入、版本隔离、队列限流、历史统计、Skill 编排和 OpenTelemetry；Claude Code 负责读取当前版本知识库和代码并生成回答。

## 必须遵守

- 暂不做登录、鉴权、SSO、RBAC。
- 允许逐步引入 TypeScript，但必须小步迁移，不得一次性重写现有前端。
- 暂不引入 React/Vue/Next，除非后续任务明确要求。
- 当前 vanilla HTML/CSS/JS 前端可以先保留，后续可迁到 TypeScript module。
- 允许新增 Supabase 作为数据底座，但默认 provider 必须仍然是 sqlite。
- 允许新增 Python worker 目录，但只有后续任务明确要求时才能创建。
- Supabase service role key 只能在服务端使用，禁止进入 public/、前端 bundle、/api/config、/api/versions。
- 所有业务表后续迁入 Supabase 时必须默认开启 RLS。
- Supabase migration 必须避免真实密钥、真实 URL、真实业务数据。
- public 业务表必须启用 RLS。
- 新增 Supabase 表时，要考虑 versionId 隔离和 org_id 隔离。
- 不得在前端暴露 Supabase service role key。
- Supabase Store 只能在服务端创建 service client。
- 新增 Store 必须提供 fake client 单测，不能依赖真实 Supabase 网络。
- 默认 sqlite 行为必须有测试保护。
- InsightStore 调用方必须使用 await，以兼容后续 Supabase/Python-backed store。
- SQLite store 可以保持同步实现，但调用链必须 async-safe。
- 报告任务 runner 不得产生 unhandled Promise rejection。
- 默认运行行为必须保持本地 SQLite，不配置 Supabase 时项目仍能启动、测试通过。
- 不要重造复杂 RAG 平台；默认使用 Claude Code 的只读工具检索当前版本目录。
- 每个问答请求必须携带 versionId。
- 不要跨版本读取知识库或代码。
- 默认只允许 Claude Code 使用 Read / Glob / Grep / LS。
- 禁止 Edit / MultiEdit / Write / NotebookEdit / Bash / WebFetch / WebSearch。
- 不要在 /api/config 或 /api/versions 中暴露本机绝对路径。
- 暂不实现 Eval。
- 路径处理必须跨平台，使用 node:path，不要硬编码 `/`。
- 数据洞察报告中的统计数字必须由服务端确定性计算，大模型只做解释和建议。
- 报告 LLM 输入必须是聚合、脱敏、截断后的数据，不要传完整日志、完整回答、代码片段、绝对路径、密钥或敏感标识。
- 不要在每次提问同步调用大模型做深度洞察；报告分析只由报告生成触发或后续定时任务触发。
- 数据洞察、历史、FAQ 和 Skill 候选必须按 versionId 隔离，不能跨版本复用原始问题或回答。

## 开发习惯

- 优先小步修改，避免一次性大重写。
- 修改后运行 `npm run check`。
- 新增测试后运行 `npm test`。
- 新增 `.mjs` 文件后，把它加入 `package.json` 的 check 脚本，或改造成自动检查所有 src/scripts/test 文件。
- 遥测中不要记录完整问题、完整回答、代码片段、绝对路径和敏感信息。
- 新增洞察 API 时，空数据要返回 0 指标和空数组，不要影响问答主链路。
- LLM 增强失败时要降级为确定性统计报告，并标记 partial/disabled 状态。

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
11. 数据洞察报告中心、改进建议、FAQ 候选和 Skill 候选闭环。
