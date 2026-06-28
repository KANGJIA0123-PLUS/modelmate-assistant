import { generateInsightReport } from "./report-generator.mjs";
import { makeId } from "./ids.mjs";

const REPORT_JOB_TYPE = "report_generation";
const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function createReportJobRunner({ store, config, versionRegistry, reportGenerator = generateInsightReport }) {
  const queue = [];
  const activeJobIds = new Set();
  let isPumping = false;

  const runner = {
    createReportJob,
    getJob,
    listJobs,
    resumePendingJobs
  };

  void resumePendingJobs().catch((error) => {
    console.warn(`Warning: 报告任务恢复失败：${error.message || String(error)}`);
  });
  return runner;

  async function createReportJob(request = {}) {
    const payload = normalizeReportRequest(request);
    const now = new Date().toISOString();
    const job = await store.saveJob({
      id: makeId("job", [REPORT_JOB_TYPE, now, Math.random(), JSON.stringify(payload)]),
      type: REPORT_JOB_TYPE,
      status: "queued",
      payload,
      result: {},
      errorMessage: "",
      createdAt: now,
      updatedAt: now
    });

    enqueue(job.id);
    return job;
  }

  async function getJob(id) {
    return await store.getJob(id);
  }

  async function listJobs(filter = {}) {
    return await store.listJobs(filter);
  }

  async function resumePendingJobs() {
    const pending = (await store.listJobs({
      type: REPORT_JOB_TYPE,
      status: "queued,running",
      limit: 20
    }))?.items || [];

    for (const job of pending.reverse()) {
      enqueue(job.id);
    }
  }

  function enqueue(jobId) {
    if (!jobId || activeJobIds.has(jobId) || queue.includes(jobId)) {
      return;
    }

    queue.push(jobId);
    schedulePump();
  }

  function schedulePump() {
    setTimeout(() => {
      void pump().catch((error) => {
        console.warn(`Warning: 报告任务执行失败：${error.message || String(error)}`);
      });
    }, 0);
  }

  async function pump() {
    if (isPumping) {
      return;
    }

    isPumping = true;

    try {
      while (queue.length > 0) {
        const jobId = queue.shift();
        const job = await store.getJob(jobId);

        if (!job || !ACTIVE_STATUSES.has(job.status)) {
          continue;
        }

        activeJobIds.add(job.id);
        await store.updateJob(job.id, {
          status: "running",
          errorMessage: ""
        });

        try {
          const result = await reportGenerator({
            store,
            config,
            versionRegistry,
            request: job.payload
          });
          await store.updateJob(job.id, {
            status: "succeeded",
            result: {
              reportId: result.reportId
            },
            errorMessage: ""
          });
        } catch (error) {
          await store.updateJob(job.id, {
            status: "failed",
            result: {},
            errorMessage: error.message || String(error)
          });
        } finally {
          activeJobIds.delete(job.id);
        }
      }
    } finally {
      isPumping = false;

      if (queue.length > 0) {
        schedulePump();
      }
    }
  }
}

export function normalizeReportRequest(request = {}) {
  const type = normalizeChoice(request.type, ["weekly", "version", "custom"], "weekly");
  const range = normalizeChoice(request.range, ["7d", "30d", "custom"], "7d");
  const payload = {
    type,
    versionId: String(request.versionId || "all").trim().slice(0, 120) || "all",
    range,
    llmEnhanced: Boolean(request.llmEnhanced)
  };

  if (type === "custom" || range === "custom") {
    payload.type = "custom";
    payload.range = "custom";
    payload.start = String(request.start || "").trim().slice(0, 32);
    payload.end = String(request.end || "").trim().slice(0, 32);
  }

  return payload;
}

export function isActiveReportJob(job) {
  return Boolean(job && job.type === REPORT_JOB_TYPE && ACTIVE_STATUSES.has(job.status));
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : fallback;
}
