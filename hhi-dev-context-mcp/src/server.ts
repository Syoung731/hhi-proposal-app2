import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDevContextBaseUrl, getJson } from "./devContextClient";

type ToolOutput = Record<string, unknown>;

function asToolText(payload: ToolOutput): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(tool: string, message: string, details?: Record<string, unknown>) {
  return asToolText({
    ok: false,
    tool,
    error: message,
    ...(details ?? {}),
  });
}

export function createDevContextMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "hhi-dev-context-mcp",
      version: "0.1.0",
    },
    {
      instructions:
        "Read-only MCP adapter for hhi-dev-context. Use these tools for local diagnostics only.",
    },
  );

  server.registerTool(
    "get_summary",
    {
      title: "Get Dev Summary",
      description: "Returns GET /summary from hhi-dev-context.",
    },
    async () => {
      const result = await getJson<Record<string, unknown>>("/summary");
      if (!result.ok) return toolError("get_summary", result.error, { url: result.url, status: result.status });
      return asToolText({ ok: true, tool: "get_summary", url: result.url, summary: result.data });
    },
  );

  server.registerTool(
    "get_route_health",
    {
      title: "Get Route Health",
      description: "Returns route health for one route or all routes.",
      inputSchema: { route: z.string().optional() },
    },
    async (args) => {
      const route = args.route?.trim();
      const path = route ? `/route-health/${encodeURIComponent(route)}` : "/route-health";
      const result = await getJson<Record<string, unknown>>(path);
      if (!result.ok) return toolError("get_route_health", result.error, { url: result.url, status: result.status });
      return asToolText({
        ok: true,
        tool: "get_route_health",
        url: result.url,
        route: route ?? null,
        data: result.data,
      });
    },
  );

  server.registerTool(
    "get_latest_errors",
    {
      title: "Get Latest Errors",
      description: "Returns recent errors from GET /errors.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async (args) => {
      const result = await getJson<Record<string, unknown>>("/errors", { limit: args.limit });
      if (!result.ok) return toolError("get_latest_errors", result.error, { url: result.url, status: result.status });
      return asToolText({
        ok: true,
        tool: "get_latest_errors",
        url: result.url,
        limit: args.limit ?? null,
        data: result.data,
      });
    },
  );

  server.registerTool(
    "get_latest_sync_run",
    {
      title: "Get Latest Sync Run",
      description: "Returns latest_sync_run from GET /summary.",
    },
    async () => {
      const result = await getJson<Record<string, unknown>>("/summary");
      if (!result.ok) {
        return toolError("get_latest_sync_run", result.error, { url: result.url, status: result.status });
      }
      return asToolText({
        ok: true,
        tool: "get_latest_sync_run",
        url: result.url,
        latest_sync_run: result.data.latest_sync_run ?? null,
      });
    },
  );

  server.registerTool(
    "get_changed_files",
    {
      title: "Get Changed Files",
      description: "Returns recent changed files from GET /changed-files.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async (args) => {
      const result = await getJson<Record<string, unknown>>("/changed-files", { limit: args.limit });
      if (!result.ok) return toolError("get_changed_files", result.error, { url: result.url, status: result.status });
      return asToolText({
        ok: true,
        tool: "get_changed_files",
        url: result.url,
        limit: args.limit ?? null,
        data: result.data,
      });
    },
  );

  server.registerTool(
    "get_task_runs",
    {
      title: "Get Task Runs",
      description: "Returns recent task runs from GET /task-runs.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        task: z.string().min(1).optional(),
      },
    },
    async (args) => {
      const result = await getJson<Record<string, unknown>>("/task-runs", {
        limit: args.limit,
        task: args.task,
      });
      if (!result.ok) return toolError("get_task_runs", result.error, { url: result.url, status: result.status });
      return asToolText({
        ok: true,
        tool: "get_task_runs",
        url: result.url,
        limit: args.limit ?? null,
        task: args.task ?? null,
        data: result.data,
      });
    },
  );

  return server;
}

export async function startDevContextMcpServer(): Promise<void> {
  const server = createDevContextMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const diagnostics = {
    server: "hhi-dev-context-mcp",
    transport: "stdio",
    devContextBaseUrl: getDevContextBaseUrl(),
    tools: [
      "get_summary",
      "get_route_health",
      "get_latest_errors",
      "get_latest_sync_run",
      "get_changed_files",
      "get_task_runs",
    ],
  };

  process.stderr.write(`[hhi-dev-context-mcp] ready ${JSON.stringify(diagnostics)}\n`);
}
