import assert from "node:assert/strict";
import test from "node:test";
import { MemoryInsightStore } from "../src/insights/insight-store.mjs";
import { createReportJobRunner, normalizeReportRequest } from "../src/insights/report-job-runner.mjs";

test("normalizes report job payload to report parameters only", () => {
  const payload = normalizeReportRequest({
    type: "custom",
    versionId: "v1",
    range: "custom",
    start: "2026-06-01",
    end: "2026-06-07",
    llmEnhanced: true,
    question: "should not be stored"
  });

  assert.deepEqual(payload, {
    type: "custom",
    versionId: "v1",
    range: "custom",
    llmEnhanced: true,
    start: "2026-06-01",
    end: "2026-06-07"
  });
});

test("report job runner persists queued jobs and completes them", async () => {
  const store = new MemoryInsightStore({ enabled: true });
  const runner = createReportJobRunner({
    store,
    config: {},
    versionRegistry: {},
    reportGenerator: async ({ request }) => {
      assert.equal(request.type, "weekly");
      await delay(5);
      return { reportId: "report_test_1" };
    }
  });

  const job = await runner.createReportJob({
    type: "weekly",
    versionId: "all",
    range: "7d",
    llmEnhanced: false
  });

  assert.equal(job.status, "queued");
  assert.equal((await runner.listJobs({ status: "queued,running,succeeded" })).items.length, 1);

  const done = await waitForJob(runner, job.id, "succeeded");
  assert.equal(done.result.reportId, "report_test_1");
  assert.equal(done.errorMessage, "");
});

async function waitForJob(runner, jobId, status) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    const job = await runner.getJob(jobId);

    if (job?.status === status) {
      return job;
    }

    await delay(10);
  }

  throw new Error(`job ${jobId} did not reach ${status}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
