const DEFAULT_BASE_URL = "http://127.0.0.1:3999";
const REQUEST_TIMEOUT_MS = 2500;

export type DevContextRequestResult<T> =
  | { ok: true; url: string; data: T }
  | { ok: false; url: string; status?: number; error: string };

export function getDevContextBaseUrl(): string {
  return (process.env.HHI_DEV_CONTEXT_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${getDevContextBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function getJson<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<DevContextRequestResult<T>> {
  const url = buildUrl(path, query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        url,
        status: response.status,
        error: `Request failed with ${response.status}`,
      };
    }

    const json = (await response.json()) as T;
    return { ok: true, url, data: json };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, url, error: message };
  } finally {
    clearTimeout(timer);
  }
}
