import { loadConfig } from "../src/config.mjs";
import { askClaude } from "../src/claude-runner.mjs";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('用法：npm run ask -- "这个接口报错怎么排查？"');
  process.exit(1);
}

const config = loadConfig();

for (const warning of config.warnings) {
  console.error(`Warning: ${warning}`);
}

try {
  const result = await askClaude(question, config);
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
