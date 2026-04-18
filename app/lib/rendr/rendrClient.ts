/**
 * Server-side Rendr API client. Handles OAuth token management and all API calls.
 * NEVER import this from client-side code — credentials must stay server-side.
 */

import { prisma } from "@/app/lib/prisma";
import { decryptSecret } from "@/app/lib/integration-secrets";
import type {
  RendrProjectsResponse,
  RendrProject,
  RendrSpaceDetail,
  RendrSpacesResponse,
  RendrTakeoffData,
} from "./types";

const RENDR_BASE_URL = "https://app.rendr.com";

// ---------------------------------------------------------------------------
// In-memory token cache
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

async function getRendrCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const record = await prisma.integrationSetting.findUnique({
    where: { service: "rendr" },
  });
  if (!record) return null;
  try {
    const clientSecret = decryptSecret(record.clientSecret);
    return { clientId: record.clientId, clientSecret };
  } catch {
    return null;
  }
}

/** Fetch a fresh OAuth token or return cached one if still valid. */
export async function getRendrToken(): Promise<string> {
  // Return cached token if valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const creds = await getRendrCredentials();
  if (!creds) {
    throw new Error("Rendr credentials not configured or inactive.");
  }

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  const res = await fetch(`${RENDR_BASE_URL}/o/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Rendr token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token as string;
  // expires_in is in seconds (typically 36000 = 10 hours)
  const expiresIn = (data.expires_in as number) || 36000;
  tokenExpiresAt = Date.now() + expiresIn * 1000;

  return cachedToken;
}

/** Internal: make an authenticated GET to Rendr API. */
async function rendrGet<T>(path: string): Promise<T> {
  const token = await getRendrToken();
  const url = `${RENDR_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Rendr API ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Internal: make an authenticated POST to Rendr API. */
async function rendrPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getRendrToken();
  const url = `${RENDR_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Rendr API POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Internal: make an authenticated PUT to Rendr API. */
async function rendrPut<T>(path: string, body: unknown): Promise<T> {
  const token = await getRendrToken();
  const url = `${RENDR_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Rendr API PUT ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

export async function listRendrProjects(page = 1, pageSize = 10): Promise<RendrProjectsResponse> {
  return rendrGet<RendrProjectsResponse>(`/api/v3/projects/?page=${page}&page_size=${pageSize}`);
}

export async function getRendrProject(projectId: number): Promise<RendrProject> {
  return rendrGet<RendrProject>(`/api/v3/projects/${projectId}/`);
}

export async function listRendrSpaces(page = 1, pageSize = 10): Promise<RendrSpacesResponse> {
  return rendrGet<RendrSpacesResponse>(`/api/v3/spaces/?page=${page}&page_size=${pageSize}`);
}

/** Get full space detail including photos. */
export async function getRendrSpaceDetail(spaceId: number): Promise<RendrSpaceDetail> {
  return rendrGet<RendrSpaceDetail>(`/api/v3/spaces/${spaceId}/`);
}

/** Get the full JSON geometry blob for a space (walls, rooms, doors, objects, etc.). */
export async function getRendrSpaceGeometry(spaceId: number): Promise<unknown> {
  return rendrGet<unknown>(`/api/v3/spaces/json/data/${spaceId}/`);
}

/** Proxy a Rendr photo URL (requires auth). */
export async function streamRendrPhoto(photoUrl: string): Promise<Response> {
  const token = await getRendrToken();
  return fetch(photoUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Create a new Rendr project, optionally with spaces assigned. */
export async function createRendrProject(
  name: string,
  description: string,
  spaceIds: string[] = [],
): Promise<RendrProject> {
  return rendrPost<RendrProject>("/api/v3/projects/", {
    name,
    description,
    space_ids: spaceIds,
  });
}

/** Add spaces to an existing Rendr project. */
export async function addSpacesToProject(
  projectId: number,
  spaceIds: string[],
): Promise<RendrProject> {
  return rendrPut<RendrProject>(`/api/v3/projects/${projectId}/spaces/`, spaceIds);
}

export async function getRendrTakeoffData(spaceId: number): Promise<RendrTakeoffData> {
  return rendrGet<RendrTakeoffData>(`/api/v3/spaces/take/off/data/${spaceId}/`);
}

/** Construct the PDF URL for a space floor plan. Auth header required. */
export function getRendrSpacePdfUrl(spaceId: number): string {
  return `${RENDR_BASE_URL}/api/v3/spaces/pdf/${spaceId}/`;
}

/** Stream the floor plan PDF with auth header. Returns a Response for proxying. */
export async function streamRendrFloorPlan(spaceId: number): Promise<Response> {
  const token = await getRendrToken();
  const url = getRendrSpacePdfUrl(spaceId);
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Check if Rendr integration is configured and active. */
export async function isRendrConfigured(): Promise<boolean> {
  const record = await prisma.integrationSetting.findUnique({
    where: { service: "rendr" },
  });
  return !!record?.isActive;
}

/** Test connection by requesting a token. Returns success/failure. */
export async function testRendrConnection(): Promise<{ success: boolean; message: string }> {
  try {
    await getRendrToken();
    // Update DB with success
    await prisma.integrationSetting.update({
      where: { service: "rendr" },
      data: { lastTestedAt: new Date(), lastTestResult: "success", isActive: true },
    });
    return { success: true, message: "Connected to Rendr successfully." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Update DB with failure
    await prisma.integrationSetting.updateMany({
      where: { service: "rendr" },
      data: { lastTestedAt: new Date(), lastTestResult: "failed" },
    });
    // Invalidate cached token on failure
    cachedToken = null;
    tokenExpiresAt = 0;
    return { success: false, message: msg };
  }
}
