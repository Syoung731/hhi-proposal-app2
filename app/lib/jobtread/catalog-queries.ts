/**
 * Pave query builders for organization catalog (cost items) and cost group templates.
 * Server-only — used by the catalog sync and template import API routes.
 *
 * Pattern mirrors the existing job-level queries in queries.ts:
 *   job: { $: { id: jobId }, costItems: { ... } }
 * becomes:
 *   organization: { $: { id: orgId }, costItems: { ... } }
 */

const CATALOG_PAGE_SIZE = 100;
const TEMPLATE_PAGE_SIZE = 50;

/** Resolve the current grant's organization ID. */
export function buildOrgIdQuery(): Record<string, unknown> {
  return {
    currentGrant: {
      id: {},
      organization: {
        id: {},
        name: {},
      },
    },
  };
}

/** One page of organization-level cost items (the pricing catalog). */
export function buildOrgCostItemsPageQuery(
  orgId: string,
  page: string | null
): Record<string, unknown> {
  return {
    organization: {
      $: { id: orgId },
      costItems: {
        $: {
          size: CATALOG_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          description: {},
          unitCost: {},
          unitPrice: {},
          quantity: {},
          costCode: { id: {}, name: {}, number: {} },
          costType: { id: {}, name: {} },
          unit: { id: {}, name: {} },
          job: { id: {} },
          document: { id: {} },
          costGroup: { id: {} },
        },
      },
    },
  };
}

/** Organization-level cost groups (templates) — top-level only. */
export function buildOrgCostGroupTemplatesQuery(
  orgId: string,
  page: string | null
): Record<string, unknown> {
  return {
    organization: {
      $: { id: orgId },
      costGroups: {
        $: {
          size: TEMPLATE_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          description: {},
          parentCostGroup: { id: {} },
          job: { id: {} },
        },
      },
    },
  };
}

/**
 * All org cost groups with parent hierarchy — mirrors buildJobCostGroupsPageQuery.
 * Used for bulk-fetch + client-side tree assembly (same pattern as job budget code).
 */
export function buildOrgCostGroupsPageQuery(
  orgId: string,
  page: string | null
): Record<string, unknown> {
  return {
    organization: {
      $: { id: orgId },
      costGroups: {
        $: {
          size: 100,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          parentCostGroup: { id: {} },
          job: { id: {} },
        },
      },
    },
  };
}

/**
 * All org cost items with group association — mirrors buildJobCostItemsPageQuery.
 * Used for bulk-fetch + client-side tree assembly.
 */
export function buildOrgCostItemsForTreePageQuery(
  orgId: string,
  page: string | null
): Record<string, unknown> {
  return {
    organization: {
      $: { id: orgId },
      costItems: {
        $: {
          size: 100,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          description: {},
          unitCost: {},
          unitPrice: {},
          quantity: {},
          costCode: { id: {}, name: {}, number: {} },
          costType: { id: {}, name: {} },
          unit: { id: {}, name: {} },
          costGroup: { id: {}, name: {}, parentCostGroup: { id: {} } },
          job: { id: {} },
          document: { id: {} },
        },
      },
    },
  };
}
