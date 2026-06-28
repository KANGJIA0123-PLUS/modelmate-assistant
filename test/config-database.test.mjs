import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";
import { buildPublicConfig } from "../src/public-config.mjs";

test("defaults database provider to sqlite when database config is absent", async () => {
  const fixture = await createConfigFixture();

  try {
    await writeJson(fixture.configPath, fixture.baseConfig);

    const config = withConfigEnv({ MODEL_MATE_CONFIG: fixture.configPath }, () => loadConfig());

    assert.equal(config.database.provider, "sqlite");
    assert.equal(config.database.supabase.url, "");
    assert.equal(config.database.supabase.serviceRoleKey, "");
    assert.equal(config.database.supabase.schema, "public");
    assert.equal(config.database.supabase.orgId, "");
  } finally {
    await fixture.cleanup();
  }
});

test("assistant.config.example.json loads with database defaults", () => {
  const examplePath = path.resolve("assistant.config.example.json");

  const config = withConfigEnv({ MODEL_MATE_CONFIG: examplePath }, () => loadConfig());

  assert.equal(config.database.provider, "sqlite");
  assert.equal(config.database.supabase.schema, "public");
});

test("database environment variables override provider and supabase settings", async () => {
  const fixture = await createConfigFixture();

  try {
    await writeJson(fixture.configPath, fixture.baseConfig);

    const config = withConfigEnv({
      MODEL_MATE_CONFIG: fixture.configPath,
      MODEL_MATE_DATABASE_PROVIDER: "supabase",
      SUPABASE_URL: "https://modelmate.example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      MODEL_MATE_SUPABASE_SCHEMA: "assistant",
      MODEL_MATE_SUPABASE_ORG_ID: "00000000-0000-0000-0000-000000000001"
    }, () => loadConfig());

    assert.equal(config.database.provider, "supabase");
    assert.equal(config.database.supabase.url, "https://modelmate.example.supabase.co");
    assert.equal(config.database.supabase.serviceRoleKey, "service-role-secret");
    assert.equal(config.database.supabase.schema, "assistant");
    assert.equal(config.database.supabase.orgId, "00000000-0000-0000-0000-000000000001");
  } finally {
    await fixture.cleanup();
  }
});

test("invalid database provider throws a clear error", async () => {
  const fixture = await createConfigFixture();

  try {
    await writeJson(fixture.configPath, {
      ...fixture.baseConfig,
      database: {
        provider: "postgres"
      }
    });

    assert.throws(
      () => withConfigEnv({ MODEL_MATE_CONFIG: fixture.configPath }, () => loadConfig()),
      /database\.provider 仅支持 sqlite 或 supabase：postgres/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("public config does not expose supabase service role key", () => {
  const publicConfig = buildPublicConfig({
    config: {
      host: "127.0.0.1",
      port: 4878,
      model: "",
      claudeBare: false,
      maxTurns: 8,
      timeoutMs: 600000,
      retrievalMode: "claude-tools",
      contextMaxChars: 8000,
      historyMaxMessages: 8,
      historyMaxChars: 6000,
      queue: { implementationStatus: "implemented" },
      telemetry: {},
      skills: {},
      historyStore: { retentionDays: 180 },
      insights: {},
      warnings: [],
      allowedTools: ["Read", "Glob", "Grep", "LS"],
      disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"],
      database: {
        provider: "supabase",
        supabase: {
          url: "https://modelmate.example.supabase.co",
          serviceRoleKey: "service-role-secret",
          schema: "assistant",
          orgId: "00000000-0000-0000-0000-000000000001"
        }
      }
    },
    versionRegistry: {
      getPublicDefaultVersionId: () => "default"
    },
    askQueue: {
      getStats: () => ({ activeCount: 0, queuedCount: 0 })
    },
    historyStore: {
      enabled: true
    }
  });

  const serialized = JSON.stringify(publicConfig);

  assert.equal(publicConfig.database.provider, "supabase");
  assert.equal(publicConfig.database.supabase.url, "https://modelmate.example.supabase.co");
  assert.equal(publicConfig.database.supabase.schema, "assistant");
  assert.equal("serviceRoleKey" in publicConfig.database.supabase, false);
  assert.equal("orgId" in publicConfig.database.supabase, false);
  assert.equal(serialized.includes("serviceRoleKey"), false);
  assert.equal(serialized.includes("service-role-secret"), false);
  assert.equal(serialized.includes("00000000-0000-0000-0000-000000000001"), false);
});

async function createConfigFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "modelmate-config-database-"));
  const sourceDir = path.join(root, "knowledge");
  const configPath = path.join(root, "assistant.config.json");

  await fs.mkdir(sourceDir, { recursive: true });

  return {
    configPath,
    baseConfig: {
      defaultVersionId: "default",
      versions: [
        {
          id: "default",
          sourceDirs: [sourceDir],
          workingDirectory: sourceDir
        }
      ],
      historyStore: { enabled: false },
      insights: { enabled: false }
    },
    cleanup: () => fs.rm(root, { recursive: true, force: true })
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function withConfigEnv(overrides, callback) {
  const keys = [
    "MODEL_MATE_CONFIG",
    "MODEL_MATE_DATABASE_PROVIDER",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MODEL_MATE_SUPABASE_SCHEMA",
    "MODEL_MATE_SUPABASE_ORG_ID"
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
