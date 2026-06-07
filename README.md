# Modelmate 辅助运营助手

这是一个本地 MVP：用 Web 页面接收问题，后端先用本机检索从资料、Markdown 文档和代码仓中找片段，再调用 Claude Code 的非交互模式生成中文回答。

## 快速开始

1. 复制配置文件：

   ```bash
   cp assistant.config.example.json assistant.config.json
   ```

2. 编辑 `assistant.config.json`，把 `sourceDirs` 改成你的资料目录和代码仓绝对路径，例如：

   ```json
   {
     "sourceDirs": [
       "/Users/you/docs/online-ops",
       "/Users/you/work/service-a",
       "/Users/you/work/service-b"
     ]
   }
   ```

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

## 当前边界

- 页面提供“使用人账号”输入框，不做登录、密码或权限校验。
- 页面会把历史会话保存在当前浏览器的 `localStorage`，刷新后仍可切换查看，也可以在侧栏删除。
- 每次提问会把当前会话最近几条用户/助手消息作为上下文传给后端，默认最多 8 条。
- 每次提问都会记录到本地 JSONL 日志，默认路径是 `data/question-log.jsonl`。
- 日志会记录使用人、问题、回答摘要、耗时、来源文件、Claude 模型信息、访问来源等。
- 页面默认使用流式接口 `/api/ask-stream`，会先返回检索状态、模型状态和后续回答增量。
- 默认只允许 Claude Code 使用 `Read`、`Glob`、`Grep`、`LS`。
- 默认禁用 `Edit`、`Write`、`MultiEdit`、`NotebookEdit`、`Bash`、`WebFetch`、`WebSearch`。
- 默认 `retrievalMode` 是 `local-context`：后端先用 `rg` 做快速预检索，再把片段交给 Claude Code 回答。这个模式更适合本机模型或慢速环境。
- 默认 Claude Code 调用超时是 10 分钟，可以通过 `assistant.config.json` 的 `timeoutMs` 调整。
- 会话上下文窗口可以通过 `historyMaxMessages` 和 `historyMaxChars` 调整。
- 如果希望 Claude Code 自己使用只读工具读取目录，可以把 `retrievalMode` 改成 `claude-tools`，但慢速模型可能会明显变慢。
- 回答优先依赖本地资料和代码；本地没命中的通用知识问题，会使用模型通用知识回答并提示来源边界。
- 对现网状态、内部事实、最新动态和高风险问题，资料不足时会提示补充资料或核验来源。
- `assistant.config.json` 已加入 `.gitignore`，方便你放本机路径。
- `data/*.jsonl` 已加入 `.gitignore`，避免把提问记录提交到代码仓。

## 问答记录

页面历史和服务端审计日志是两套东西：

- 页面历史：保存在当前浏览器 `localStorage`，用于会话切换和追问上下文。
- 审计日志：保存在 `data/question-log.jsonl`，用于查看谁问了什么、耗时、来源和模型信息。

日志每行是一条 JSON，例如：

```json
{"timestamp":"2026-06-05T18:44:08.775Z","operator":"alice","question":"你好","elapsedMs":0,"quickReply":true}
```

查看最近记录：

```bash
tail -n 20 data/question-log.jsonl
```

## 推荐演进

1. 第一阶段：维护 `sourceDirs`，把常问问题相关资料、接口文档、排障手册、代码仓接进来。
2. 第二阶段：把常见问答沉淀成 `md`，让助手回答越来越稳定。
3. 第三阶段：接入飞书、企业微信或 Slack，让同事在群里提问，后端仍然走这个本地服务。
4. 第四阶段：增加审计、权限、知识源分组、问题标签和人工确认流程。

## Claude Code 调用方式

默认模式使用类似下面的命令：

```bash
claude -p "带本地片段的问题" \
  --output-format json \
  --permission-mode dontAsk \
  --tools "" \
  --max-turns 1
```

`claude-tools` 模式使用类似下面的命令：

```bash
claude -p "问题" \
  --output-format json \
  --permission-mode dontAsk \
  --tools Read,Glob,Grep,LS \
  --allowedTools Read,Glob,Grep,LS \
  --disallowedTools Edit,MultiEdit,Write,NotebookEdit,Bash,WebFetch,WebSearch \
  --add-dir /path/to/docs /path/to/repo
```

Claude Code 官方 CLI 文档说明了 `-p`、`--output-format json`、`--add-dir`、`--allowedTools`、`--disallowedTools`、`--max-turns` 等参数。

流式模式使用 `--output-format stream-json --verbose --include-partial-messages`。服务端会过滤 thinking 片段，只把最终回答文本增量推给页面。
