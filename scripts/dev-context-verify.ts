async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: res.status, body: text };
  }
}

function buildUrl(host: string, port: string, path: string): string {
  return `http://${host}:${port}${path}`;
}

async function main() {
  const ctxHost = "127.0.0.1";
  const ctxPort = process.env.HHI_DEV_CONTEXT_PORT ?? "3999";

  // /summary is the compact AI-friendly endpoint.
  const summary = await fetchJson(buildUrl(ctxHost, ctxPort, "/summary"));

  // Route health for the pricing route from the requirements.
  const encodedRoute = encodeURIComponent("/admin/settings/jobtread-pricing");
  const routeHealthUrl = buildUrl(ctxHost, ctxPort, `/route-health/${encodedRoute}`);
  let routeHealth: unknown = null;
  try {
    routeHealth = await fetchJson(routeHealthUrl);
  } catch {
    routeHealth = { error: "route health not available yet" };
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        dev_context_base: buildUrl(ctxHost, ctxPort, ""),
        summary,
        route_health_for_pricing_route: routeHealth,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[dev-context-verify] failed:", e);
  process.exit(1);
});

