import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactsDir = path.join(root, "artifacts");

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f766e"/>
    </marker>
    <linearGradient id="soft" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f2f7f6"/>
    </linearGradient>
    <style>
      .bg { fill: #f7f8f6; }
      .title { font: 760 42px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif; fill: #111827; letter-spacing: 0; }
      .subtitle { font: 400 18px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif; fill: #687174; letter-spacing: 0; }
      .section { font: 700 17px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif; fill: #3f494b; }
      .label { font: 720 24px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif; fill: #111827; }
      .small { font: 400 15px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif; fill: #667174; }
      .tiny { font: 420 13px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif; fill: #717b7e; }
      .card { fill: #ffffff; stroke: #dfe7e7; stroke-width: 1.4; rx: 18; filter: url(#shadow); }
      .module { fill: url(#soft); stroke: #cfdede; stroke-width: 1.4; rx: 16; }
      .accent { fill: #0f766e; }
      .accent-soft { fill: #e3f3ef; stroke: #b9d9d2; stroke-width: 1.2; rx: 16; }
      .line { stroke: #0f766e; stroke-width: 2.2; fill: none; marker-end: url(#arrow); }
      .muted-line { stroke: #a8bcbe; stroke-width: 1.7; fill: none; marker-end: url(#arrow); }
      .zone { fill: #ffffff; stroke: #e1e7e8; stroke-width: 1.2; rx: 20; opacity: 0.92; }
    </style>
  </defs>

  <rect class="bg" width="1600" height="900"/>
  <rect x="42" y="40" width="1516" height="820" rx="28" fill="#fbfcfc" stroke="#e3e8e9"/>

  <text x="80" y="104" class="title">Modelmate 辅助运营助手架构</text>
  <text x="80" y="139" class="subtitle">把本地资料、代码仓、Claude Code 与模型通用能力合成一个可追问、可审计、可运营的问答入口</text>

  <rect x="80" y="186" width="270" height="510" class="zone"/>
  <text x="108" y="225" class="section">使用入口</text>

  <rect x="112" y="256" width="206" height="118" class="card"/>
  <circle cx="150" cy="302" r="18" class="accent"/>
  <text x="178" y="310" class="label">使用人</text>
  <text x="132" y="342" class="small">现网接口人 / 同事</text>

  <rect x="112" y="422" width="206" height="132" class="module"/>
  <text x="132" y="468" class="label">浏览器界面</text>
  <text x="132" y="502" class="small">账号、提问、流式回答</text>
  <text x="132" y="528" class="tiny">调用过程展开/收起</text>

  <rect x="112" y="598" width="206" height="88" class="accent-soft"/>
  <text x="132" y="634" class="label">历史会话</text>
  <text x="132" y="662" class="small">localStorage 保存 / 删除</text>

  <rect x="410" y="186" width="435" height="510" class="zone"/>
  <text x="438" y="225" class="section">服务编排层</text>

  <rect x="450" y="262" width="305" height="98" class="card"/>
  <text x="476" y="306" class="label">Node 后端</text>
  <text x="476" y="334" class="small">/api/config  /api/ask-stream</text>

  <rect x="450" y="414" width="305" height="98" class="module"/>
  <text x="476" y="458" class="label">本地预检索</text>
  <text x="476" y="486" class="small">rg 检索资料、Markdown、代码仓</text>

  <rect x="450" y="566" width="305" height="98" class="module"/>
  <text x="476" y="610" class="label">Prompt 组装</text>
  <text x="476" y="638" class="small">当前问题 + 本地片段 + 最近上下文</text>

  <rect x="900" y="186" width="298" height="510" class="zone"/>
  <text x="928" y="225" class="section">模型调用层</text>

  <rect x="938" y="306" width="220" height="112" class="card"/>
  <text x="966" y="352" class="label">Claude Code</text>
  <text x="966" y="382" class="small">只读工具 / stream-json</text>

  <rect x="938" y="506" width="220" height="112" class="module"/>
  <text x="966" y="552" class="label">模型服务</text>
  <text x="966" y="582" class="small">本地或远端大模型能力</text>

  <rect x="1256" y="186" width="264" height="510" class="zone"/>
  <text x="1284" y="225" class="section">知识与审计</text>

  <rect x="1284" y="282" width="200" height="126" class="accent-soft"/>
  <text x="1308" y="328" class="label">本地知识源</text>
  <text x="1308" y="360" class="small">资料 / md 文档</text>
  <text x="1308" y="386" class="small">代码仓 / 配置</text>

  <rect x="1284" y="506" width="200" height="126" class="card"/>
  <text x="1308" y="552" class="label">审计日志</text>
  <text x="1308" y="584" class="small">data/question-log.jsonl</text>
  <text x="1308" y="610" class="small">账号、问题、耗时、来源</text>

  <path class="line" d="M 215 374 C 215 394 215 402 215 422"/>
  <path class="line" d="M 318 488 C 370 488 396 312 450 312"/>
  <path class="muted-line" d="M 318 642 C 370 642 388 616 450 616"/>
  <path class="line" d="M 602 360 L 602 414"/>
  <path class="line" d="M 602 512 L 602 566"/>
  <path class="line" d="M 755 615 C 842 615 858 362 938 362"/>
  <path class="line" d="M 1048 418 L 1048 506"/>
  <path class="muted-line" d="M 1284 345 C 1118 345 928 462 755 462"/>
  <path class="muted-line" d="M 755 312 C 966 170 1184 235 1284 282"/>
  <path class="muted-line" d="M 755 616 C 950 724 1146 647 1284 568"/>

  <rect x="97" y="742" width="1382" height="68" rx="16" fill="#111827"/>
  <text x="126" y="782" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',Arial,sans-serif" font-size="20" font-weight="650" fill="#ffffff">核心机制：</text>
  <text x="222" y="782" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',Arial,sans-serif" font-size="18" fill="#d5e1e2">本地资料优先查证；本地未命中的通用知识可由模型补充；每次问答保留浏览器历史上下文并写入服务端审计日志。</text>
</svg>`;

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Modelmate 辅助运营助手架构图</title>
    <style>
      body {
        margin: 0;
        background: #eef1f2;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }
      .frame {
        width: min(1600px, 100%);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
        border-radius: 28px;
        overflow: hidden;
        background: white;
      }
      svg {
        width: 100%;
        height: auto;
        display: block;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="frame" aria-label="Modelmate 辅助运营助手架构图">
${svg}
      </section>
    </main>
  </body>
</html>`;

const review = `# Modelmate 当前界面专业性评审

评审对象：\`artifacts/modelmate-current-ui.png\`

## 结论

当前界面已经具备产品化基础：有清晰的侧栏、运行边界、会话上下文、历史会话和流式问答入口。整体风格比早期工具型页面更稳，适合继续向“内部 AI 运营助手”演进。

## 做得好的地方

- 信息架构清楚：账号、历史会话、运行状态、知识源、运行边界被放在左侧，主工作区专注问答。
- 视觉克制：浅灰背景、黑色主按钮、深青色状态点，整体没有过度装饰。
- 上下文可见：顶部展示当前会话和上下文条数，用户能理解追问能力。
- 调用过程可展开：适合解释“为什么慢、当前在检索还是模型生成”。

## 仍可优化的地方

- 侧栏在窄屏下信息密度较高，可以给“运行边界”加折叠，默认保留历史会话和账号。
- 历史会话删除按钮目前是简单 ×，后续可以改成 hover 时出现的图标按钮，并加二次确认或撤销。
- 空态提示可以更运营化，例如给出“现网排障、接口说明、代码定位、通用知识”四类快捷入口。
- 调用过程可以继续升级为“步骤时间线”，每一步显示耗时，例如本地检索 0.1s、模型首字 8.2s、总耗时 73.6s。

## 建议下一版

1. 增加会话搜索和按账号筛选。
2. 增加答案来源区，单独列出命中文件和本地知识库未命中提示。
3. 增加服务端会话库，把浏览器 localStorage 升级为可跨设备查看的历史记录。
4. 增加慢请求诊断，把 Claude Code、模型首字时间、检索耗时分开记录。
`;

await fs.mkdir(artifactsDir, { recursive: true });
await fs.writeFile(path.join(artifactsDir, "modelmate-architecture.svg"), `${svg}\n`, "utf8");
await fs.writeFile(path.join(artifactsDir, "modelmate-architecture.html"), html, "utf8");
await fs.writeFile(path.join(artifactsDir, "modelmate-ui-review.md"), review, "utf8");

console.log(JSON.stringify({
  svg: path.join(artifactsDir, "modelmate-architecture.svg"),
  html: path.join(artifactsDir, "modelmate-architecture.html"),
  review: path.join(artifactsDir, "modelmate-ui-review.md")
}, null, 2));
