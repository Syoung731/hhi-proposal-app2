import { NextRequest, NextResponse } from "next/server";
import { jobTreadRequest } from "@/app/lib/jobtread/client";

export async function GET(req: NextRequest) {
  const orgId = "22P3uKaSn7Ca";
  const pageParam = new URL(req.url).searchParams.get("page");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await jobTreadRequest({
    organization: {
      $: { id: orgId },
      costItems: {
        $: { size: 10, ...(pageParam ? { page: pageParam } : {}) },
        nextPage: {},
        nodes: {
          id: {},
          name: {},
          job: { id: {} },
          costGroup: { id: {}, name: {} },
        },
      },
    },
  }) as any;
  const conn = raw?.organization?.costItems;
  const nodes = conn?.nodes ?? [];
  const nextPage = conn?.nextPage ?? null;

  let withJob = 0;
  let withoutJob = 0;
  let withCostGroup = 0;
  for (const n of nodes) {
    if (n.job?.id) withJob++;
    else withoutJob++;
    if (n.costGroup?.id) withCostGroup++;
  }

  return NextResponse.json({
    count: nodes.length,
    nextPage,
    withJob,
    withoutJob,
    withCostGroup,
    sample: nodes.slice(0, 3),
  });
}
