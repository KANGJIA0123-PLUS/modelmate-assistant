import { loadConfig } from "../src/config.mjs";
import { askClaude } from "../src/claude-runner.mjs";
import { VersionRegistry } from "../src/version-registry.mjs";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('用法：npm run ask -- "这个接口报错怎么排查？"');
  process.exit(1);
}

const config = loadConfig();
const versionRegistry = new VersionRegistry(config);
const versionContext = versionRegistry.getDefaultVersion();

for (const warning of config.warnings) {
  console.error(`Warning: ${warning}`);
}

if (!versionContext) {
  console.error("没有可用版本，请检查 versions 配置。");
  process.exit(1);
}

try {
  const result = await askClaude(question, config, versionContext);
  console.log(result.answer);

  if (result.raw?.total_cost_usd !== undefined) {
    console.error(`\nCost: $${result.raw.total_cost_usd}`);
  }

  if (result.context?.usedFiles?.length) {
    console.error(`Sources: ${result.context.usedFiles.length}`);
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
