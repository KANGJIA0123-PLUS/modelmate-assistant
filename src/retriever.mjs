import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const IGNORE_GLOBS = [
  "-g",
  "!.git",
  "-g",
  "!node_modules",
  "-g",
  "!dist",
  "-g",
  "!build",
  "-g",
  "!coverage",
  "-g",
  "!target",
  "-g",
  "!*.lock"
];

const FILE_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".rst",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".conf",
  ".config",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".java",
  ".go",
  ".py",
  ".rb",
  ".php",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".rs",
  ".sql",
  ".sh",
  ".xml",
  ".html",
  ".css"
]);

const DOMAIN_TERMS = [
  "接口",
  "配置",
  "日志",
  "订单",
  "支付",
  "回调",
  "鉴权",
  "登录",
  "超时",
  "报错",
  "失败",
  "限流",
  "降级",
  "缓存",
  "数据库",
  "网关",
  "状态",
  "重试",
  "告警",
  "现网"
];

export async function retrieveLocalContext(question, config) {
  const terms = extractSearchTerms(question);
  const files = await listCandidateFiles(config.sourceDirs);
  const fileMatches = matchFilesByName(files, terms);
  const contentMatches = shouldOnlyUseNamedFiles(terms, fileMatches)
    ? []
    : terms.length > 0 ? await searchContent(terms, config) : [];
  const snippets = buildSnippets(fileMatches, contentMatches, config.contextMaxChars);

  return {
    terms,
    fileMatchCount: fileMatches.length,
    contentMatchCount: contentMatches.length,
    text: snippets.text,
    usedFiles: snippets.usedFiles
  };
}

function shouldOnlyUseNamedFiles(terms, fileMatches) {
  if (fileMatches.length === 0) {
    return false;
  }

  return terms.some((term) => {
    const ext = path.extname(term).toLowerCase();
    return ext && FILE_EXTENSIONS.has(ext);
  });
}

export function extractSearchTerms(question) {
  const terms = new Set();
  const asciiMatches = question.match(/[A-Za-z0-9][A-Za-z0-9_.:/-]{1,}/g) || [];

  for (const match of asciiMatches) {
    terms.add(match);
  }

  const cjkMatches = question.match(/[\u4e00-\u9fff]{2,}/g) || [];

  for (const chunk of cjkMatches) {
    for (const domainTerm of DOMAIN_TERMS) {
      if (chunk.includes(domainTerm)) {
        terms.add(domainTerm);
      }
    }

    if (chunk.length <= 6) {
      terms.add(chunk);
    }
  }

  return [...terms].filter((term) => term.length >= 2).slice(0, 12);
}

async function listCandidateFiles(sourceDirs) {
  const files = [];

  for (const sourceDir of sourceDirs) {
    const result = await runRg(["--files", "--hidden", ...IGNORE_GLOBS, "."], sourceDir);
    const lines = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const absolutePath = path.resolve(sourceDir, line);

      if (isTextLikeFile(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  return [...new Set(files)];
}

function matchFilesByName(files, terms) {
  if (terms.length === 0) {
    return [];
  }

  const lowerTerms = terms.map((term) => term.toLowerCase());

  return files
    .map((file) => {
      const lowerFile = file.toLowerCase();
      const score = lowerTerms.reduce((total, term) => total + (lowerFile.includes(term) ? 1 : 0), 0);
      return { file, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.length - b.file.length)
    .map((item) => item.file)
    .slice(0, 8);
}

async function searchContent(terms, config) {
  const matches = [];
  const args = [
    "-n",
    "--no-heading",
    "--color",
    "never",
    "--hidden",
    "-S",
    ...IGNORE_GLOBS,
    ...terms.flatMap((term) => ["-e", term]),
    "."
  ];

  for (const sourceDir of config.sourceDirs) {
    const result = await runRg(args, sourceDir);
    const lines = result.stdout.split("\n").filter(Boolean);

    for (const line of lines) {
      const match = parseRgLine(line, sourceDir);

      if (match && isTextLikeFile(match.file)) {
        matches.push(match);
      }

      if (matches.length >= config.searchMaxMatches) {
        return matches;
      }
    }
  }

  return matches;
}

function buildSnippets(fileMatches, contentMatches, maxChars) {
  const chunks = [];
  const usedFiles = new Set();
  const grouped = new Map();
  const fileMatchSet = new Set(fileMatches);

  for (const file of fileMatches) {
    const snippet = readFileSnippet(file, 1, 80);

    if (snippet) {
      chunks.push(snippet);
      usedFiles.add(file);
    }
  }

  for (const match of contentMatches) {
    if (fileMatchSet.has(match.file)) {
      continue;
    }

    if (!grouped.has(match.file)) {
      grouped.set(match.file, []);
    }

    grouped.get(match.file).push(match.lineNumber);
  }

  for (const [file, lineNumbers] of grouped.entries()) {
    const uniqueLines = [...new Set(lineNumbers)].slice(0, 4);

    for (const lineNumber of uniqueLines) {
      const snippet = readFileSnippet(file, Math.max(1, lineNumber - 3), lineNumber + 3);

      if (snippet) {
        chunks.push(snippet);
        usedFiles.add(file);
      }

      if (chunks.join("\n\n").length >= maxChars) {
        return truncateContext(chunks, usedFiles, maxChars);
      }
    }
  }

  return truncateContext(chunks, usedFiles, maxChars);
}

function readFileSnippet(file, startLine, endLine) {
  try {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const selected = lines.slice(startLine - 1, endLine);

    if (selected.length === 0) {
      return "";
    }

    const body = selected.map((line, index) => `${startLine + index}: ${line}`).join("\n");
    return `--- ${file}:${startLine}-${Math.min(endLine, lines.length)} ---\n${body}`;
  } catch {
    return "";
  }
}

function truncateContext(chunks, usedFiles, maxChars) {
  const text = chunks.join("\n\n");

  if (text.length <= maxChars) {
    return { text, usedFiles: [...usedFiles] };
  }

  return {
    text: `${text.slice(0, maxChars)}\n\n[上下文已截断]`,
    usedFiles: [...usedFiles]
  };
}

function parseRgLine(line, sourceDir) {
  const first = line.indexOf(":");
  const second = line.indexOf(":", first + 1);

  if (first === -1 || second === -1) {
    return null;
  }

  const relativeFile = line.slice(0, first);
  const lineNumber = Number(line.slice(first + 1, second));

  if (!Number.isFinite(lineNumber)) {
    return null;
  }

  return {
    file: path.resolve(sourceDir, relativeFile),
    lineNumber,
    text: line.slice(second + 1)
  };
}

function isTextLikeFile(file) {
  const ext = path.extname(file).toLowerCase();

  if (!ext) {
    return true;
  }

  return FILE_EXTENSIONS.has(ext);
}

function runRg(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("rg", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      resolve({ stdout: "", stderr: error.message, exitCode: 1 });
    });

    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}
