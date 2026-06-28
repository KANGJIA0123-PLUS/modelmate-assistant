import { buildInsightSnapshot } from "../insights/insight-aggregator.mjs";
import { createReportJobRunner } from "../insights/report-job-runner.mjs";

export function createInsightsRouteHandler({ config, versionRegistry, insightStore, sendJson, readJsonBody }) {
  const reportJobRunner = createReportJobRunner({
    store: insightStore,
    config,
    versionRegistry
  });

  return async function handleInsightsRoute(request, response, requestUrl) {
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/api/insights/overview") {
      const snapshot = await buildSnapshot(requestUrl);
      return sendJson(response, snapshot.overview);
    }

    if (request.method === "GET" && pathname === "/api/insights/categories") {
      const snapshot = await buildSnapshot(requestUrl);
      return sendJson(response, wrapItems(snapshot.categories));
    }

    if (request.method === "GET" && pathname === "/api/insights/frequent-questions") {
      const limit = Number(requestUrl.searchParams.get("limit") || config.insights?.topClusterLimit || 20);
      const snapshot = await buildSnapshot(requestUrl);
      return sendJson(response, wrapItems(snapshot.frequentQuestions.slice(0, safeLimit(limit))));
    }

    if (request.method === "GET" && pathname === "/api/insights/versions") {
      const snapshot = await buildSnapshot(requestUrl);
      return sendJson(response, wrapItems(snapshot.versions));
    }

    if (request.method === "GET" && pathname === "/api/insights/knowledge-gaps") {
      const snapshot = await buildSnapshot(requestUrl);
      return sendJson(response, wrapItems(snapshot.knowledgeGaps));
    }

    if (request.method === "GET" && pathname === "/api/insights/improvement-suggestions") {
      const status = requestUrl.searchParams.get("status") || "open";
      return sendJson(response, await insightStore.listSuggestions({ status, limit: requestUrl.searchParams.get("limit") || 100 }));
    }

    if (request.method === "GET" && pathname === "/api/insights/efficiency-opportunities") {
      const snapshot = await buildSnapshot(requestUrl);
      return sendJson(response, wrapItems(snapshot.efficiencyOpportunities));
    }

    if (request.method === "POST" && pathname === "/api/reports/generate") {
      const body = await readJsonBody(request);
      const job = await reportJobRunner.createReportJob(body);
      return sendJson(response, {
        jobId: job.id,
        job
      }, 202);
    }

    if (request.method === "GET" && pathname === "/api/report-jobs") {
      return sendJson(response, await reportJobRunner.listJobs({
        type: requestUrl.searchParams.get("type") || "",
        status: requestUrl.searchParams.get("status") || "",
        limit: requestUrl.searchParams.get("limit") || 20
      }));
    }

    const reportJobMatch = pathname.match(/^\/api\/report-jobs\/([^/]+)$/);

    if (request.method === "GET" && reportJobMatch) {
      const job = await reportJobRunner.getJob(decodeURIComponent(reportJobMatch[1]));
      return job ? sendJson(response, job) : sendJson(response, { error: "任务不存在。" }, 404);
    }

    if (request.method === "GET" && pathname === "/api/reports") {
      return sendJson(response, await insightStore.listReports({
        type: requestUrl.searchParams.get("type") || "",
        limit: requestUrl.searchParams.get("limit") || 20
      }));
    }

    const reportMarkdownMatch = pathname.match(/^\/api\/reports\/([^/]+)\/markdown$/);

    if (request.method === "GET" && reportMarkdownMatch) {
      const report = await insightStore.getReport(decodeURIComponent(reportMarkdownMatch[1]));

      if (!report) {
        return sendJson(response, { error: "报告不存在。" }, 404);
      }

      response.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(report.markdown || "");
      return true;
    }

    const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);

    if (request.method === "GET" && reportMatch) {
      const report = await insightStore.getReport(decodeURIComponent(reportMatch[1]));
      return report ? sendJson(response, report) : sendJson(response, { error: "报告不存在。" }, 404);
    }

    const suggestionMatch = pathname.match(/^\/api\/improvement-suggestions\/([^/]+)$/);

    if (request.method === "PATCH" && suggestionMatch) {
      const body = await readJsonBody(request);
      const item = await insightStore.updateSuggestion(decodeURIComponent(suggestionMatch[1]), body);
      return item ? sendJson(response, item) : sendJson(response, { error: "建议不存在。" }, 404);
    }

    return false;
  };

  async function buildSnapshot(requestUrl) {
    return buildInsightSnapshot({
      store: insightStore,
      config,
      versionRegistry,
      query: Object.fromEntries(requestUrl.searchParams.entries())
    });
  }
}

function wrapItems(items) {
  return {
    enabled: true,
    items: Array.isArray(items) ? items : []
  };
}

function safeLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.floor(number))) : 20;
}
