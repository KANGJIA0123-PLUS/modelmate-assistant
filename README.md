# Modelmate 辅助运营助手

这是一个本地 MVP：用 Web 页面接收问题，用户先选择业务版本，后端只把当前版本的资料、Markdown 文档和代码仓目录交给 Claude Code，再由 Claude Code 用只读工具生成中文回答。

## 快速开始

1. 复制配置文件：

   ```bash
   cp assistant.config.example.json assistant.config.json
   ```

2. 编辑 `assistant.config.json`，把 `versions` 改成你的业务版本、资料目录和代码仓目录，例如：

   ```json
   {
     "defaultVersionId": "v2.3",
     "versions": [
       {
         "id": "v2.3",
         "name": "业务 v2.3",
         "description": "v2.3 现网接口资料和代码仓",
         "workingDirectory": "/Users/you/modelmate-sources/v2.3/docs",
         "sourceDirs": [
           "/Users/you/modelmate-sources/v2.3/docs",
           "/Users/you/modelmate-sources/v2.3/repo"
         ],
         "status": "active",
         "tags": ["prod", "v2.3"]
       },
       {
         "id": "v2.4",
         "name": "业务 v2.4",
         "description": "v2.4 现网接口资料和代码仓",
         "workingDirectory": "/Users/you/modelmate-sources/v2.4/docs",
         "sourceDirs": [
           "/Users/you/modelmate-sources/v2.4/docs",
           "/Users/you/modelmate-sources/v2.4/repo"
         ],
         "status": "active",
         "tags": ["prod", "v2.4"]
       }
     ]
   }
   ```

   每个版本的 `sourceDirs` 必须是互不重叠的实体目录，不能多个版本共用同一个目录，也不能把某个版本配置成另一个版本目录的父级或子级。`workingDirectory` 必须位于该版本自己的 `sourceDirs` 内。

3. 启动：

   ```bash
   npm start
   ```

4. 打开：

   ```text
   http://127.0.0.1:4878
   ```

也可以直接用命令行提问：

```bash
npm run ask -- "订单接口 500 应该先排查哪些配置？"
```

## Docker 一键启动

本项目支持 Docker 形态，适合内网共享或跨平台部署。Docker 镜像内置 Node.js、ripgrep 和 Claude Code CLI；默认使用 Claude Code `--bare` 模式，容器内只读取 `ANTHROPIC_API_KEY` 或 `apiKeyHelper`，不依赖宿主机 keychain/OAuth 登录态。

首次启动：

```bash
npm run docker:start
```

脚本会自动创建：

- `.env.docker`：填写 `ANTHROPIC_API_KEY`、`MODEL_MATE_MODEL` 等环境变量。
- `assistant.config.docker.json`：Docker 专用配置，知识库路径使用容器内路径。
- `data/`：SQLite、JSONL 和报告文件。
- `knowledge/default/`：默认只读知识库挂载目录。
- `repos/default/`：默认只读代码仓挂载目录。

启动后访问：

```text
http://127.0.0.1:4878
```

离线打包 Docker 镜像和启动文件：

```bash
npm run docker:package
```

指定架构：

```bash
scripts/docker-package.sh arm64
scripts/docker-package.sh amd64
scripts/docker-package.sh all
```

当前平台会生成类似：

```text
dist/modelmate-docker-arm64.tar.gz
dist/modelmate-docker-amd64.tar.gz
```

生成源码发布 ZIP：

```bash
npm run package:release
```

默认输出到上级目录的 `辅助运营.zip`。发布 ZIP 会排除 `.git/`、`.env*`、真实配置 `assistant.config*.json`（仅保留 `assistant.config.example.json` 和 `assistant.config.docker.example.json`）、`data/`、运行日志和 `__MACOSX/`。

把这个压缩包发给同架构机器后，解压并运行：

```bash
scripts/docker-start.sh
```

Windows PowerShell：

```powershell
scripts/docker-start.ps1
```

如果压缩包里带有 `modelmate-image-linux-*.tar`，启动脚本会先 `docker load`，不需要用户再从网络下载镜像。不同 CPU 架构建议分别打包：Linux/Windows x86_64 使用 `amd64` 包，ARM 服务器和 Apple Silicon 使用 `arm64` 包。

容器配置路径约定：

- `./assistant.config.docker.json` 挂载到 `/app/assistant.config.json`
- `./data` 挂载到 `/app/data`
- `./knowledge` 挂载到 `/knowledge`
- `./repos` 挂载到 `/repos`

运行环境检查：

```bash
npm run doctor
```

## Database provider

默认数据底座仍然是本地 SQLite，不配置 Supabase 时项目会继续按当前本地模式启动和测试。

后续可以通过服务端环境变量 `MODEL_MATE_DATABASE_PROVIDER=supabase` 启用已迁移的 Supabase Store，并配套设置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和 `MODEL_MATE_SUPABASE_ORG_ID`。Supabase service role key 只能放在服务端环境变量中，不能进入 `public/`、前端 bundle、`/api/config` 或 `/api/versions`，也不要把真实 key 写入提交文件。

当前 Supabase Store 只覆盖历史问答 `ask_events`，其他数据层仍按当前边界运行。

## Supabase migrations

Supabase migration 位于 `supabase/migrations`。当前 migration 只是数据库 schema 预留，用于后续 SQLite 到 Supabase 的 Store 迁移。

当前应用默认仍使用 SQLite；本轮只迁移历史问答 Store，完整 Supabase 数据层仍待后续迁移。业务表默认启用 RLS，Supabase service role key 只能由服务端使用，不能进入前端或公开配置接口。

## Supabase HistoryStore

当前 Supabase 接入只覆盖历史问答 `ask_events`，默认仍使用 SQLite。启用 Supabase HistoryStore 需要在服务端配置：

```bash
MODEL_MATE_DATABASE_PROVIDER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
MODEL_MATE_SUPABASE_ORG_ID=...
```

`SUPABASE_SERVICE_ROLE_KEY` 只能由服务端使用，不能进入前端、公开配置接口或提交文件。数据洞察、报告、聚类、FAQ 候选和 Skill 候选仍暂时使用 SQLite，后续任务再迁移。

洞察 Store 调用链已经支持 async-compatible store，方便后续接入 SupabaseInsightStore；当前默认实现仍是 SQLite。

## 当前边界

- 页面提供“使用人账号”输入框，不做登录、密码或权限校验。
- 页面必须先选择版本才能提问；后端没有收到 `versionId` 会返回 400。
- 页面会把历史会话和上次选择的版本保存在当前浏览器的 `localStorage`，刷新后仍可切换查看，也可以在侧栏删除。
- 每次提问会把当前会话最近几条用户/助手消息作为上下文传给后端，默认最多 8 条。
- 每次提问都会记录到本地 JSONL 日志，默认路径是 `data/question-log.jsonl`。
- 日志会记录使用人、问题、回答摘要、耗时、来源文件、Claude 模型信息、访问来源等。
- 默认启用 SQLite 历史库，路径是 `data/assistant.sqlite`，用于版本内历史问题、高频问题和分类统计查询。
- 默认启用数据洞察地基，用于总览、高频问题、分类分析、版本分析、知识缺口、平台改进建议、AI 提效建议和报告中心。
- 页面默认使用流式接口 `/api/ask-stream`，会先返回检索状态、模型状态和后续回答增量。
- `/api/ask-stream` 会使用 `config.queue` 控制并发、排队上限、排队等待超时、单次任务超时，以及按 `operator` 和客户端 IP 的每分钟限流。
- `/api/config` 会返回 `capabilities`，明确 Queue、Telemetry 和 Skills 的实现状态，页面侧栏会按该字段展示，避免把预留配置误认为已启用。
- Queue 是已实现能力：问答流式请求已接入队列、并发控制、排队超时、任务超时和按账号/IP限流。
- Telemetry 是预留能力：`telemetry.*` 配置字段已保留，但当前版本不会启动 OpenTelemetry SDK、OTLP exporter 或 Claude telemetry 环境变量；即使配置里把 `telemetry.enabled` 设为 `true`，服务端也会降级为未启用并给出 warning。
- Skills 当前是候选沉淀能力：数据洞察会生成 FAQ/Skill 候选；运行时自动 Skill 编排和 FAQ 直达仍未实现，`skills.faqDirectAnswerEnabled` 即使配置为 `true` 也会被视为预留并给出 warning。
- 默认只允许 Claude Code 使用 `Read`、`Glob`、`Grep`、`LS`。
- 默认禁用 `Edit`、`Write`、`MultiEdit`、`NotebookEdit`、`Bash`、`WebFetch`、`WebSearch`。
- 默认 `retrievalMode` 是 `claude-tools`：Claude Code 只会获得当前版本的 `sourceDirs`，并使用只读工具 `Read`、`Glob`、`Grep`、`LS` 检索资料和代码。
- 如果希望后端先用 `rg` 做快速预检索，再把片段交给 Claude Code，可以把 `retrievalMode` 改为 `local-context`；这个模式也只检索当前版本目录。
- 不同版本的 `sourceDirs` 会做物理隔离校验：目录重叠会拒绝启动，版本工作目录不在本版本 sourceDirs 内会自动收敛到本版本第一个 sourceDirs。
- 问答运行时必须带 `versionId`，后端只从该版本的 `sourceDirs` 构造 Claude Code 调用，不使用全局 `sourceDirs` 兜底。
- 默认 Claude Code 调用超时是 10 分钟，可以通过 `assistant.config.json` 的 `timeoutMs` 调整。
- 会话上下文窗口可以通过 `historyMaxMessages` 和 `historyMaxChars` 调整。
- 回答优先依赖当前版本资料和代码；当前版本没命中的通用知识问题，会使用模型通用知识回答并提示来源边界。
- 对现网状态、内部事实、最新动态和高风险问题，资料不足时会提示补充资料或核验来源。
- `assistant.config.json` 已加入 `.gitignore`，方便你放本机路径。
- `/api/config` 和 `/api/versions` 不会返回本机绝对路径，避免把内部目录暴露给前端。
- `data/` 已加入 `.gitignore`，避免把提问记录、报告和本地统计库提交到代码仓。

## 问答记录

页面历史和服务端审计日志是两套东西：

- 页面历史：保存在当前浏览器 `localStorage`，用于会话切换和追问上下文。
- 审计日志：保存在 `data/question-log.jsonl`，用于查看谁问了什么、耗时、来源和模型信息。
- 查询统计：保存在 `data/assistant.sqlite`，由页面“数据洞察”读取，用于当前版本内的历史、高频和分类统计。

SQLite 只用于查询和统计，JSONL 仍然保留为原始追加流水。统计按 `versionId` 隔离，同一个问题在不同版本下不会合并。

## 数据保留和清理

默认保留策略：

- JSONL 审计日志和 SQLite 问答明细：按 `historyStore.retentionDays` 保留，默认 180 天。
- 洞察报告、FAQ/Skill 候选和已关闭建议：按 `insights.reportRetentionDays` 保留，默认 365 天；仍处于 `open`、`accepted`、`in_progress` 的建议和候选会保留，避免丢失待处理事项。
- 报告任务和 LLM 运行元数据：按 `insights.jobRetentionDays` 保留，默认 30 天。

预览清理影响：

```bash
npm run cleanup:data
```

实际执行：

```bash
npm run cleanup:data -- --apply
```

可临时覆盖保留天数：

```bash
npm run cleanup:data -- --retention-days=90
npm run cleanup:data -- --report-retention-days=180 --job-retention-days=14
```

清理脚本默认只 dry-run。JSONL 中无法解析时间或损坏的旧行会被保留，避免误删审计数据。需要回收 SQLite 文件空间时，可以在实际执行时追加 `--vacuum`。

日志每行是一条 JSON，例如：

```json
{"timestamp":"2026-06-05T18:44:08.775Z","operator":"alice","question":"你好","elapsedMs":0,"quickReply":true}
```

查看最近记录：

```bash
tail -n 20 data/question-log.jsonl
```

## 数据洞察

页面顶部可以切换到“数据洞察”工作区，当前支持：

- 总览：核心指标、高频问题、分类分布、版本分布。
- 高频问题：按问题簇展示重复咨询。
- 分类分析：按固定 L1/L2 分类体系统计。
- 版本分析：查看不同版本的问题量、资料不足率和失败率。
- 知识缺口：识别资料不足、未命中或需要补文档的问题。
- 平台改进建议：追踪建议状态。
- AI 提效建议：沉淀 FAQ、Skill、历史复用和自动诊断机会。
- 报告中心：生成本周报告、版本专项报告和自定义范围报告。
- 报告导出：报告预览支持复制、下载 Markdown，以及通过浏览器打印保存为 PDF。

每份报告会保存结构化 JSON、Markdown、可追踪改进建议、FAQ 候选、Skill 候选和 LLM 调用元数据。默认 `insights.llmEnhanced=true`，只在报告中心手动生成报告时调用模型；关闭后报告会使用确定性统计和模板渲染。模型只接收聚合、脱敏、截断后的数据，并且不负责重算数字。

数据洞察工作区采用事件驱动自动刷新：进入工作区、切换版本、范围或页面会自动请求聚合 API；顶部“刷新”按钮保留为立即重载入口。左侧侧栏不再展示数据洞察摘要，避免和完整工作区重复。报告生成仍由用户在报告中心手动触发，并以后台任务形式执行；刷新页面后重新进入报告中心，可以通过任务状态恢复“排队中 / 生成中 / 失败”，完成后报告会出现在报告列表。

回填旧 JSONL 日志：

```bash
npm run backfill:insights
```

演练回填：

```bash
npm run backfill:insights -- --dry-run --limit=100
```

报告和洞察开发口径见：

- `docs/data-insights-report.md`
- `docs/data-insights-development.md`

## 推荐演进

1. 第一阶段：维护 `sourceDirs`，把常问问题相关资料、接口文档、排障手册、代码仓接进来。
2. 第二阶段：把常见问答沉淀成 `md`，让助手回答越来越稳定。
3. 第三阶段：接入飞书、企业微信或 Slack，让同事在群里提问，后端仍然走这个本地服务。
4. 第四阶段：增加审计、权限、知识源分组、问题标签和人工确认流程。

## Claude Code 调用方式

`local-context` 模式使用类似下面的命令：

```bash
claude -p "带本地片段的问题" \
  --output-format json \
  --permission-mode dontAsk \
  --tools "" \
  --max-turns 1
```

默认 `claude-tools` 模式使用类似下面的命令：

```bash
claude -p "问题" \
  --output-format json \
  --permission-mode dontAsk \
  --tools Read,Glob,Grep,LS \
  --allowedTools Read,Glob,Grep,LS \
  --disallowedTools Edit,MultiEdit,Write,NotebookEdit,Bash,WebFetch,WebSearch \
  --add-dir /path/to/current-version/docs /path/to/current-version/repo
```

Claude Code 官方 CLI 文档说明了 `-p`、`--output-format json`、`--add-dir`、`--allowedTools`、`--disallowedTools`、`--max-turns` 等参数。

流式模式使用 `--output-format stream-json --verbose --include-partial-messages`。服务端会过滤 thinking 片段，只把最终回答文本增量推给页面。

## 版本接口

- `GET /api/versions`：返回可选版本列表，只包含 `id/name/description/status/tags/sourceCount`，不返回本机路径。
- `GET /api/history?versionId=...`：返回当前版本最近问题记录，不返回本机来源路径。
- `GET /api/frequent?versionId=...`：返回当前版本内归一化后的高频问题。
- `GET /api/categories?versionId=...`：返回当前版本内的确定性分类统计。
- `GET /api/insights/overview?range=7d&versionId=all`：返回数据洞察总览。
- `GET /api/insights/frequent-questions?range=7d&versionId=all`：返回问题簇高频统计。
- `GET /api/insights/categories?range=7d&versionId=all`：返回 L1/L2 分类分布。
- `GET /api/insights/versions?range=7d`：返回版本维度统计。
- `GET /api/insights/knowledge-gaps?range=7d&versionId=all`：返回知识缺口。
- `GET /api/insights/improvement-suggestions?status=open`：返回平台改进建议。
- `GET /api/insights/efficiency-opportunities?range=7d&versionId=all`：返回 AI 提效机会。
- `POST /api/reports/generate`：创建数据洞察报告生成任务，立即返回 `jobId`。
- `GET /api/report-jobs?type=report_generation&status=queued,running`、`GET /api/report-jobs/:jobId`：查看报告生成任务状态。
- `GET /api/reports`、`GET /api/reports/:reportId`、`GET /api/reports/:reportId/markdown`：查看报告。
- `PATCH /api/improvement-suggestions/:id`：更新建议状态。
- `POST /api/ask-stream`：请求体必须包含 `versionId`、`question`、`operator` 和可选 `history`；成功入队后返回 NDJSON，包含 `start`、`queue`、`status`、`delta`、`done` 或 `error` 事件，队列已满或限流时返回 429/503 JSON。
- `GET /api/health`、`GET /api/ready`：用于部署探活。
