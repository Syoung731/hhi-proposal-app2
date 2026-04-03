# hhi-dev-context-mcp

Thin read-only MCP server in front of local `hhi-dev-context`.

It does **not** write data, does **not** access the DB directly, and only calls the existing local HTTP API (default `http://127.0.0.1:3999`).

## Environment

- `HHI_DEV_CONTEXT_BASE_URL` (optional)
  - Default: `http://127.0.0.1:3999`

## Run locally

From the repo root:

```bash
npm run dev-context:mcp
```

This starts a stdio MCP server intended to be launched by an MCP-capable AI client.

## Tools exposed (read-only)

- `get_summary`
  - Calls `GET /summary`
- `get_route_health`
  - Optional `route` arg
  - Calls `GET /route-health` or `GET /route-health/:route`
- `get_latest_errors`
  - Optional `limit`
  - Calls `GET /errors?limit=...`
- `get_latest_sync_run`
  - Calls `GET /summary` and returns `latest_sync_run`
- `get_changed_files`
  - Optional `limit`
  - Calls `GET /changed-files?limit=...`
- `get_task_runs`
  - Optional `limit`
  - Optional `task`
  - Calls `GET /task-runs?limit=...&task=...`

## Local MCP client config example

Example JSON config:

```json
{
  "mcpServers": {
    "hhi-dev-context": {
      "command": "npm",
      "args": ["run", "dev-context:mcp"],
      "env": {
        "HHI_DEV_CONTEXT_BASE_URL": "http://127.0.0.1:3999"
      }
    }
  }
}
```

Notes:
- Keep this local-first; localhost only.
- No auth is included yet for local use.
- Write tools are intentionally out of scope for now.
