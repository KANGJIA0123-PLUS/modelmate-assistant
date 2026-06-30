import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardPayload } from "../src/dashboard-data.mjs";

test("dashboard payload exposes warm dual mode data without leaking local paths or secrets", async () => {
  const payload = await buildDashboardPayload({
    config: {
      host: "127.0.0.1",
      port: 4878,
      model: "Modelmate-4.1",
      retrievalMode: "local-context",
      allowedTools: ["Read", "Glob", "Grep", "LS"],
      timeoutMs: 600000,
      contextMaxChars: 8000,
      warnings: [],
      queue: {
        maxConcurrent: 2,
        maxQueue: 20
      }
    },
    versionRegistry: {
      getPublicDefaultVersionId() {
        return "26.3.0.1";
      },
      listPublicVersions() {
        return [
          {
            id: "26.3.0.1",
            name: "生产环境",
            status: "active",
            description: "cluster-prod · region-cn-hangzhou",
            sourceCount: 2,
            tags: ["stable"]
          },
          {
            id: "27.0.T101",
            name: "灰度版本",
            status: "preview",
            description: "/Users/private/repo/27.0.T101",
            sourceCount: 3,
            tags: ["canary"]
          }
        ];
      }
    },
    askQueue: {
      getStats() {
        return {
          activeCount: 1,
          queuedCount: 2,
          completedCount: 8,
          failedCount: 1
        };
      }
    },
    historyStore: {
      enabled: true,
      async listHistory() {
        return {
          enabled: true,
          items: [
            {
              createdAt: "2026-06-30T08:24:00.000Z",
              question: "接口超时排查里有没有 /Users/private/logs/app.log 的完整路径？",
              category: "故障排查",
              sourceCount: 3,
              quickReply: false,
              elapsedMs: 812
            }
          ]
        };
      },
      async listFrequent() {
        return {
          enabled: true,
          items: [
            {
              sampleQuestion: "接口超时排查",
              normalizedQuestion: "接口 超时 排查",
              category: "故障排查",
              hitCount: 6,
              avgElapsedMs: 812
            }
          ]
        };
      }
    },
    now: new Date("2026-06-30T08:30:00.000Z")
  });

  assert.equal(payload.modeLabels.customer, "客户模式");
  assert.equal(payload.modeLabels.operations, "运维观察模式");
  assert.equal(payload.customer.knowledgeScope.versionId, "26.3.0.1");
  assert.equal(payload.customer.quickPrompts.length >= 4, true);
  assert.equal(payload.operations.runtime.model, "Modelmate-4.1");
  assert.equal(payload.operations.hotIssues.length > 0, true);

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /\/Users\//);
  assert.doesNotMatch(serialized, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY|orgId|sk-[A-Za-z0-9_-]+/);
  assert.doesNotMatch(serialized, /完整路径/);
});
