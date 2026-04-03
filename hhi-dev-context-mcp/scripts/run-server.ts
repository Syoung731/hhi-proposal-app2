import { startDevContextMcpServer } from "../src/server";

startDevContextMcpServer().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[hhi-dev-context-mcp] fatal ${message}\n`);
  process.exit(1);
});
