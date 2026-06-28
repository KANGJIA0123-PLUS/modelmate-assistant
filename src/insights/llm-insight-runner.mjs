import { spawn } from "node:child_process";
import { extractJsonObject } from "./json-extractor.mjs";
import { hashText } from "./ids.mjs";
import { recordInsightMetric, withInsightSpan } from "./insight-telemetry.mjs";

export async function runInsightLlm(prompt, config, options = {}) {
  return withInsightSpan("insights.llm.run", { purpose: "report" }, async () => runInsightLlmInner(prompt, config, options));
}

async function runInsightLlmInner(prompt, config, options = {}) {
  const startedAt = Date.now();
  const inputHash = hashText(prompt).slice(0, 32);
  const command = config.effectiveClaudePath || config.claudePath || "claude";
  const timeoutMs = Number(config.insights?.analysisTimeoutMs || config.timeoutMs || 600000);
  const maxBudgetUsd = Number(config.insights?.llmMaxBudgetUsd || config.maxBudgetUsd || 0);
  const args = [
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--max-turns",
    "1",
    "--tools",
    ""
  ];

  if (config.claudeBare) {
    args.push("--bare");
  }

  if (config.model) {
    args.push("--model", String(config.model));
  }

  if (maxBudgetUsd > 0) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  try {
    const { stdout, stderr, exitCode } = await runProcess(command, args, {
      cwd: config.workingDirectory,
      input: prompt,
      timeoutMs
    });
    const elapsedMs = Date.now() - startedAt;

    if (exitCode !== 0) {
      await saveLlmRunSafe(options.store, {
        purpose: "report",
        inputHash,
        status: "error",
        elapsedMs,
        errorMessage: stderr || stdout || `exit ${exitCode}`
      });
      recordInsightMetric("insight_llm_error_count", 1, { status: "error" });
      return null;
    }

    const parsed = extractClaudeJson(stdout);
    const content = parsed?.result || parsed?.answer || stdout;
    const json = extractJsonObject(content);
    await saveLlmRunSafe(options.store, {
      purpose: "report",
      inputHash,
      status: json ? "success" : "invalid_json",
      elapsedMs,
      modelNames: parsed?.modelUsage ? Object.keys(parsed.modelUsage) : [],
      errorMessage: json ? "" : "LLM output did not contain a JSON object."
    });
    recordInsightMetric("insight_llm_error_count", json ? 0 : 1, {
      status: json ? "success" : "invalid_json"
    });
    return json;
  } catch (error) {
    await saveLlmRunSafe(options.store, {
      purpose: "report",
      inputHash,
      status: "error",
      elapsedMs: Date.now() - startedAt,
      errorMessage: error.message || String(error)
    });
    recordInsightMetric("insight_llm_error_count", 1, { status: "error" });
    return null;
  }
}

async function saveLlmRunSafe(store, run) {
  try {
    await store?.saveLlmRun?.(run);
  } catch (error) {
    console.warn(`Warning: 洞察 LLM 运行记录保存失败：${error.message || String(error)}`);
  }
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });
    let stdout = "";
    let stderr = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      child.kill("SIGTERM");
      reject(new Error(`洞察 LLM 调用超时，已超过 ${Math.round(options.timeoutMs / 1000)} 秒。`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.stdin.end(String(options.input || ""));
    child.on("error", (error) => {
      clearTimeout(timer);
      done = true;
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      done = true;
      resolve({ stdout, stderr, exitCode });
    });
  });
}

function extractClaudeJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}
