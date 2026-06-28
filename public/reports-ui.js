import {
  fetchReport,
  fetchReportJob,
  fetchReportJobs,
  fetchReports,
  generateInsightReport as requestInsightReportGeneration
} from "./api.js";

export function createReportsUi({ dom, state, helpers }) {
  let lastReportMarkdown = "";
  let lastReportMeta = null;
  let reportJobPollTimer = null;
  const reportJobWatchTimers = new Map();

  return {
    renderReportsPage,
    generateInsightReport,
    openInsightReport,
    copyReportMarkdown,
    downloadReportMarkdown,
    printReportPdf,
    clearReportJobListPolling
  };

  async function renderReportsPage() {
    const [reports, jobs] = await Promise.all([
      fetchReports({ limit: 20 }),
      fetchReportJobs({ type: "report_generation", status: "queued,running,failed", limit: 6 })
    ]);
    const items = Array.isArray(reports.items) ? reports.items : [];
    const jobItems = Array.isArray(jobs.items) ? jobs.items : [];
    const canLlm = state.runtimeConfig?.insights?.llmEnhanced;

    dom.insightsPageContent.innerHTML = `
      <div class="report-actions">
        <button class="primary-button" type="button" data-insights-action="generate-report" data-report-type="weekly">生成本周报告</button>
        <button class="secondary-button" type="button" data-insights-action="generate-report" data-report-type="version">生成版本专项</button>
        <button class="secondary-button" type="button" data-insights-action="generate-report" data-report-type="custom">生成自定义报告</button>
        <span>${helpers.escapeHtml(canLlm ? "LLM 增强已启用" : "确定性报告")}</span>
      </div>
      <div id="report-job-list" class="report-job-list">
        ${renderReportJobList(jobItems)}
      </div>
      <div class="reports-layout">
        <div class="report-list">
          ${renderReportList(items)}
        </div>
        <div id="report-preview" class="report-preview">
          <p class="insight-empty">请选择报告。</p>
        </div>
      </div>
    `;
    scheduleReportJobListPolling(jobItems);
  }

  async function generateInsightReport(type) {
    if (!dom.insightsPageContent) {
      return;
    }

    const body = buildReportRequest(type);
    const payload = await requestInsightReportGeneration(body);
    const jobId = payload.jobId || payload.job?.id || "";
    await renderReportsPage();

    if (jobId) {
      watchReportJob(jobId, { openOnSuccess: true });
    }
  }

  function renderReportList(items) {
    return renderCardList(items, (item) => `
      <button class="report-link" type="button" data-insights-action="open-report" data-report-id="${helpers.escapeHtml(item.reportId)}">
        <strong>${helpers.escapeHtml(item.title || "数据洞察报告")}</strong>
        <span>${helpers.escapeHtml(`${item.type} · ${item.versionId} · ${helpers.formatRelativeTime(item.generatedAt)}`)}</span>
      </button>
    `);
  }

  function renderReportJobList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    return `
      <section class="report-job-panel" aria-label="报告生成任务">
        <div class="report-job-head">
          <strong>生成任务</strong>
          <span>${helpers.escapeHtml(items.some(isActiveReportJob) ? "后台生成中" : "最近任务")}</span>
        </div>
        <div class="report-job-items">
          ${items.map(renderReportJobItem).join("")}
        </div>
      </section>
    `;
  }

  function renderReportJobItem(job) {
    const resultReportId = job.result?.reportId || "";
    const status = formatReportJobStatus(job.status);
    const title = formatReportJobTitle(job.payload || {});
    const detail = job.status === "failed"
      ? job.errorMessage || "生成失败。"
      : `${helpers.formatRelativeTime(job.updatedAt || job.createdAt)} · ${status}`;

    return `
      <article class="report-job-item" data-status="${helpers.escapeHtml(job.status || "queued")}">
        <div>
          <strong>${helpers.escapeHtml(title)}</strong>
          <span>${helpers.escapeHtml(detail)}</span>
        </div>
        ${resultReportId ? `<button class="secondary-button" type="button" data-insights-action="open-report" data-report-id="${helpers.escapeHtml(resultReportId)}">查看</button>` : ""}
      </article>
    `;
  }

  function scheduleReportJobListPolling(items) {
    const shouldPoll = state.selectedAppView === "insights"
      && state.selectedInsightsPage === "reports"
      && Array.isArray(items)
      && items.some(isActiveReportJob);

    if (!shouldPoll) {
      clearReportJobListPolling();
      return;
    }

    if (reportJobPollTimer) {
      return;
    }

    reportJobPollTimer = window.setTimeout(async () => {
      reportJobPollTimer = null;

      if (state.selectedAppView !== "insights" || state.selectedInsightsPage !== "reports") {
        return;
      }

      try {
        await refreshReportJobsPanel();
      } catch {
        scheduleReportJobListPolling(items);
      }
    }, 2200);
  }

  function clearReportJobListPolling() {
    if (!reportJobPollTimer) {
      return;
    }

    window.clearTimeout(reportJobPollTimer);
    reportJobPollTimer = null;
  }

  async function refreshReportJobsPanel() {
    const jobs = await fetchReportJobs({ type: "report_generation", status: "queued,running,failed", limit: 6 });
    const jobItems = Array.isArray(jobs.items) ? jobs.items : [];
    const jobList = document.querySelector("#report-job-list");

    if (jobList) {
      jobList.innerHTML = renderReportJobList(jobItems);
    }

    const hasActive = jobItems.some(isActiveReportJob);

    if (hasActive) {
      scheduleReportJobListPolling(jobItems);
      return;
    }

    await refreshReportList();
  }

  async function refreshReportList() {
    const reports = await fetchReports({ limit: 20 });
    const list = document.querySelector(".report-list");

    if (list) {
      list.innerHTML = renderReportList(Array.isArray(reports.items) ? reports.items : []);
    }
  }

  function watchReportJob(jobId, options = {}) {
    if (!jobId || reportJobWatchTimers.has(jobId)) {
      return;
    }

    const poll = async () => {
      try {
        const job = await fetchReportJob(jobId);

        if (job.status === "succeeded") {
          reportJobWatchTimers.delete(jobId);

          if (state.selectedAppView !== "insights" || state.selectedInsightsPage !== "reports") {
            return;
          }

          await renderReportsPage();

          if (options.openOnSuccess && job.result?.reportId) {
            await openInsightReport(job.result.reportId);
          }
          return;
        }

        if (job.status === "failed") {
          reportJobWatchTimers.delete(jobId);

          if (state.selectedAppView === "insights" && state.selectedInsightsPage === "reports") {
            await renderReportsPage();
          }
          return;
        }

        const timer = window.setTimeout(poll, 2200);
        reportJobWatchTimers.set(jobId, timer);
      } catch {
        const timer = window.setTimeout(poll, 3200);
        reportJobWatchTimers.set(jobId, timer);
      }
    };

    const timer = window.setTimeout(poll, 500);
    reportJobWatchTimers.set(jobId, timer);
  }

  async function openInsightReport(reportId) {
    if (!reportId) {
      return;
    }

    const report = await fetchReport(reportId);
    lastReportMarkdown = report.markdown || "";
    lastReportMeta = {
      reportId: report.reportId || reportId,
      title: report.title || "数据洞察报告",
      type: report.type || "report",
      generatedAt: report.generatedAt || new Date().toISOString()
    };
    const preview = document.querySelector("#report-preview");

    if (!preview) {
      return;
    }

    preview.innerHTML = `
      <div class="report-preview-head">
        <strong>${helpers.escapeHtml(report.title || "数据洞察报告")}</strong>
        <div class="report-export-actions">
          <button class="secondary-button" type="button" data-insights-action="copy-report">复制</button>
          <button class="secondary-button" type="button" data-insights-action="download-report-md">下载 MD</button>
          <button class="secondary-button" type="button" data-insights-action="print-report-pdf">导出 PDF</button>
        </div>
      </div>
      <pre>${helpers.escapeHtml(lastReportMarkdown || "报告为空。")}</pre>
    `;
  }

  async function copyReportMarkdown() {
    if (!lastReportMarkdown) {
      return;
    }

    await navigator.clipboard?.writeText(lastReportMarkdown);
  }

  function downloadReportMarkdown() {
    if (!lastReportMarkdown) {
      return;
    }

    downloadBlob({
      content: lastReportMarkdown,
      filename: `${buildReportFileBasename()}.md`,
      type: "text/markdown;charset=utf-8"
    });
  }

  function printReportPdf() {
    if (!lastReportMarkdown) {
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      downloadBlob({
        content: lastReportMarkdown,
        filename: `${buildReportFileBasename()}.md`,
        type: "text/markdown;charset=utf-8"
      });
      return;
    }

    printWindow.document.write(buildPrintableReportHtml(lastReportMarkdown, lastReportMeta));
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  function buildReportRequest(type) {
    const version = helpers.getSelectedVersion();
    const range = dom.insightsRangeSelect?.value || "7d";
    const body = {
      type,
      versionId: type === "weekly" ? "all" : (version?.id || "all"),
      range,
      llmEnhanced: Boolean(state.runtimeConfig?.insights?.llmEnhanced)
    };

    if (type === "custom" || range === "custom") {
      body.type = "custom";
      body.start = dom.insightsStart?.value || "";
      body.end = dom.insightsEnd?.value || "";
    }

    return body;
  }

  function buildReportFileBasename() {
    const meta = lastReportMeta || {};
    const datePart = formatFileDate(meta.generatedAt || new Date().toISOString());
    const titlePart = sanitizeFilename(meta.title || "data-insights-report");
    const idPart = sanitizeFilename(meta.reportId || "report").slice(0, 24);
    return `${titlePart}-${datePart}-${idPart}`;
  }

  function buildPrintableReportHtml(markdown, meta) {
    const title = meta?.title || "数据洞察报告";

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${helpers.escapeHtml(title)}</title>
  <style>
    body { margin: 32px; color: #171717; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.62; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <h1>${helpers.escapeHtml(title)}</h1>
  <pre>${helpers.escapeHtml(markdown)}</pre>
</body>
</html>`;
  }
}

function renderCardList(items, renderer) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="insight-empty">暂无数据。</p>`;
  }

  return `<div class="insight-card-list">${items.map((item) => `<article class="insight-detail-card">${renderer(item)}</article>`).join("")}</div>`;
}

function isActiveReportJob(job) {
  return job?.status === "queued" || job?.status === "running";
}

function formatReportJobStatus(status) {
  if (status === "running") {
    return "生成中";
  }

  if (status === "succeeded") {
    return "已完成";
  }

  if (status === "failed") {
    return "失败";
  }

  return "排队中";
}

function formatReportJobTitle(payload = {}) {
  const typeLabel = {
    weekly: "本周数据洞察报告",
    version: "版本专项报告",
    custom: "自定义数据洞察报告"
  }[payload.type] || "数据洞察报告";
  const rangeLabel = payload.range === "custom"
    ? [payload.start, payload.end].filter(Boolean).join(" 至 ") || "自定义范围"
    : formatReportRange(payload.range);
  return `${typeLabel} · ${payload.versionId || "all"} · ${rangeLabel}`;
}

function formatReportRange(range) {
  if (range === "30d") {
    return "最近 30 天";
  }

  return "最近 7 天";
}

function downloadBlob({ content, filename, type }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatFileDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown-date";
  }

  return date.toISOString().slice(0, 10);
}

function sanitizeFilename(value) {
  return String(value || "report")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "report";
}
