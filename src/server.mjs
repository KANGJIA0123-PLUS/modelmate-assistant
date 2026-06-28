import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { createDisabledHistoryStore, createHistoryStore } from "./history-store.mjs";
import { createDisabledInsightStore, initInsightStore } from "./insights/insight-store.mjs";
import { createQuestionLogger } from "./logging.mjs";
import { createAskRequestQueue } from "./request-queue.mjs";
import { buildPublicConfig } from "./public-config.mjs";
import { readJsonBody, getStatusCode, parseRequestUrl, sendJson } from "./request-utils.mjs";
import { createAskRouteHandler } from "./routes/ask-routes.mjs";
import { createInsightsRouteHandler } from "./routes/insights-routes.mjs";
import { createStaticServer } from "./static-server.mjs";
import { VersionRegistry } from "./version-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const config = loadConfig();
const versionRegistry = new VersionRegistry(config);
const historyStore = await initializeHistoryStore();
const insightStore = await initializeInsightStore();
const askQueue = createAskRequestQueue(config.queue);
const logQuestion = createQuestionLogger({
  config,
  historyStore,
  insightStore
});
const askRoutes = createAskRouteHandler({
  config,
  versionRegistry,
  askQueue,
  logQuestion,
  sendJson,
  readJsonBody
});
const insightsRoutes = createInsightsRouteHandler({
  config,
  versionRegistry,
  insightStore,
  sendJson,
  readJsonBody
});
const serveStatic = createStaticServer(publicDir);

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = parseRequestUrl(request, config);
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/api/config") {
      return sendJson(response, publicConfig());
    }

    if (request.method === "GET" && pathname === "/api/versions") {
      return sendJson(response, {
        defaultVersionId: versionRegistry.getPublicDefaultVersionId(),
        versions: versionRegistry.listPublicVersions()
      });
    }

    if (request.method === "GET" && pathname === "/api/health") {
      return sendJson(response, {
        status: "ok",
        service: "modelmate-assistant",
        time: new Date().toISOString()
      });
    }

    if (request.method === "GET" && pathname === "/api/ready") {
      return sendJson(response, {
        status: versionRegistry.listPublicVersions().length > 0 ? "ready" : "not-ready",
        versionCount: versionRegistry.listPublicVersions().length,
        defaultVersionId: versionRegistry.getPublicDefaultVersionId()
      });
    }

    if (request.method === "GET" && pathname === "/api/history") {
      return sendJson(response, handleHistoryQuery(requestUrl.searchParams));
    }

    if (request.method === "GET" && pathname === "/api/frequent") {
      return sendJson(response, handleFrequentQuery(requestUrl.searchParams));
    }

    if (request.method === "GET" && pathname === "/api/categories") {
      return sendJson(response, handleCategoryQuery(requestUrl.searchParams));
    }

    if (await insightsRoutes(request, response, requestUrl) !== false) {
      return;
    }

    if (await askRoutes(request, response, requestUrl) !== false) {
      return;
    }

    if (request.method === "GET") {
      return serveStatic(request, response);
    }

    sendJson(response, { error: "Method not allowed" }, 405);
  } catch (error) {
    sendJson(response, { error: error.message || String(error) }, getStatusCode(error));
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Ops answer assistant is running at http://${config.host}:${config.port}`);

  if (config.warnings.length > 0) {
    for (const warning of config.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
});

async function initializeHistoryStore() {
  if (!config.historyStore?.enabled) {
    return createDisabledHistoryStore("historyStore disabled");
  }

  try {
    return await createHistoryStore(config.historyStore);
  } catch (error) {
    config.warnings.push(`历史数据库初始化失败：${error.message || String(error)}`);
    return createDisabledHistoryStore(error.message || String(error));
  }
}

async function initializeInsightStore() {
  if (!config.insights?.enabled) {
    return createDisabledInsightStore("insights disabled");
  }

  try {
    return await initInsightStore({
      ...config.insights,
      dbPath: config.historyStore?.dbPath
    });
  } catch (error) {
    config.warnings.push(`洞察数据库初始化失败：${error.message || String(error)}`);
    return createDisabledInsightStore(error.message || String(error));
  }
}

function publicConfig() {
  return buildPublicConfig({
    config,
    versionRegistry,
    askQueue,
    historyStore
  });
}

function handleHistoryQuery(searchParams) {
  const versionContext = versionRegistry.requireVersion(searchParams.get("versionId"));
  const payload = historyStore.listHistory({
    versionId: versionContext.id,
    limit: searchParams.get("limit"),
    category: searchParams.get("category") || ""
  });

  return {
    ...payload,
    versionId: versionContext.id,
    versionName: versionContext.name
  };
}

function handleFrequentQuery(searchParams) {
  const versionContext = versionRegistry.requireVersion(searchParams.get("versionId"));
  const payload = historyStore.listFrequent({
    versionId: versionContext.id,
    limit: searchParams.get("limit")
  });

  return {
    ...payload,
    versionId: versionContext.id,
    versionName: versionContext.name
  };
}

function handleCategoryQuery(searchParams) {
  const versionContext = versionRegistry.requireVersion(searchParams.get("versionId"));
  const payload = historyStore.listCategories({
    versionId: versionContext.id
  });

  return {
    ...payload,
    versionId: versionContext.id,
    versionName: versionContext.name
  };
}
