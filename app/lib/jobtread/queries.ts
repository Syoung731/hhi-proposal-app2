/**
 * JobTread Pave API query builders. Server-only.
 * The client merges grantKey into query.$; these builders return the rest of the query shape.
 */

const BUDGET_GROUPS_PAGE_SIZE = 50;
const BUDGET_ITEMS_PAGE_SIZE = 50;

/** Minimal test query to verify connectivity: requests currentGrant.id and version. */
export function buildTestQuery(): Record<string, unknown> {
  return {
    currentGrant: {
      id: {},
    },
    version: {},
  };
}

/** Job meta: id, name, number, optional totalCost/totalPrice, and customFieldValues for stage/location. */
export function buildJobMetaQuery(jobId: string): Record<string, unknown> {
  return {
    job: {
      $: { id: jobId },
      id: {},
      name: {},
      number: {},
      totalCost: {},
      totalPrice: {},
      customFieldValues: {
        nodes: {
          value: {},
          customField: { name: {} },
        },
      },
    },
  };
}

/** One page of cost groups for a job. Pass page token or omit for first page. */
export function buildJobCostGroupsPageQuery(
  jobId: string,
  page: string | null
): Record<string, unknown> {
  return {
    job: {
      $: { id: jobId },
      costGroups: {
        $: {
          size: BUDGET_GROUPS_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          parentCostGroup: { id: {} },
        },
      },
    },
  };
}

/** One page of cost items for a job. Pass page token or omit for first page. */
export function buildJobCostItemsPageQuery(
  jobId: string,
  page: string | null
): Record<string, unknown> {
  return {
    job: {
      $: { id: jobId },
      costItems: {
        $: {
          size: BUDGET_ITEMS_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          quantity: {},
          unitPrice: {},
          unitCost: {},
          costGroup: { id: {}, name: {}, parentCostGroup: { id: {} } },
          unit: { id: {}, name: {} },
          costCode: { id: {}, name: {}, number: {} },
          costType: { id: {}, name: {} },
          document: { id: {} },
        },
      },
    },
  };
}
