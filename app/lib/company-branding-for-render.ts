/**
 * Non-admin-gated branding helper for proposal render contexts.
 *
 * # Why this exists separately from `getOrCreateCompanySettings()`
 * `getOrCreateCompanySettings()` (in `app/admin/settings/actions.ts`) calls
 * `requireAdmin()` as its first line — that's correct for the admin UI,
 * which always runs in an authenticated context. The proposal render path
 * is different: it can be reached by
 *
 *   1. The headless-Chromium PDF flow, which has no Clerk session and
 *      authenticates to the proposal page via the HMAC `pdfToken` bypass
 *      in `proxy.ts`. There is no admin context inside that browser.
 *   2. (Future) public client-share links, which by design have no Clerk
 *      session at all.
 *
 * Both contexts need a few non-secret branding fields (logos, colors,
 * company name, contact info, taglines) to render a complete deck. Calling
 * the admin-gated helper from those contexts throws `UnauthorizedError`
 * and breaks the render.
 *
 * Published snapshots (post-Cluster C.5) capture these fields into
 * `snapshotJson.branding` at publish time, so the renderer reads from
 * the snapshot first. This helper is the **fallback** for two cases:
 *
 *   - Draft preview (`/proposals/draft?...`) — there is no snapshot.
 *   - Legacy snapshots published before Cluster C.5 — `branding` is absent
 *     on those rows; the renderer falls back here.
 *
 * # Why we don't `getOrCreateCompanySettings()` and strip the admin gate
 * `getOrCreateCompanySettings()` ALSO creates the row if missing — that's
 * a write side-effect we don't want from a render path. This helper is
 * read-only and returns null fields when no row exists; the adapter
 * (`adaptBrandingForDeck`) maps null inputs to product defaults
 * ("HHI Builders", `#E87722`, etc.) without crashing.
 */

import "server-only";

import { prisma } from "@/app/lib/prisma";
import type { SnapshotBranding } from "@/app/lib/snapshot";

/**
 * Read the singleton `CompanySettings` and project a render-safe branding
 * slice. Returns nulls — never empty strings — for fields that aren't set,
 * matching the publish-action's behavior so snapshot rows and the live
 * fallback look identical to `adaptBrandingForDeck`. Never throws on a
 * missing row; never calls `requireAdmin()`. Safe from any render context.
 */
export async function getCompanyBrandingForRender(): Promise<SnapshotBranding> {
  const settings = await prisma.companySettings.findFirst({
    select: {
      logoLightUrl: true,
      logoDarkUrl: true,
      primaryColorHex: true,
      textColorHex: true,
      companyName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
      phone: true,
      email: true,
      brandTagline: true,
      closingHeadline: true,
    },
  });

  return {
    logoLightUrl: settings?.logoLightUrl ?? null,
    logoDarkUrl: settings?.logoDarkUrl ?? null,
    primaryColorHex: settings?.primaryColorHex ?? null,
    textColorHex: settings?.textColorHex ?? null,
    companyName: settings?.companyName ?? null,
    addressLine1: settings?.addressLine1 ?? null,
    addressLine2: settings?.addressLine2 ?? null,
    city: settings?.city ?? null,
    state: settings?.state ?? null,
    zip: settings?.zip ?? null,
    phone: settings?.phone ?? null,
    email: settings?.email ?? null,
    brandTagline: settings?.brandTagline ?? null,
    closingHeadline: settings?.closingHeadline ?? null,
  };
}
