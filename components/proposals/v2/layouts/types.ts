import type { ProposalPage } from "../page-model";
import type { ProposalV2SectionProps } from "../mock-data-adapter";

/** Props passed to every layout component: page config + full section data. */
export type ProposalLayoutProps = {
  page: ProposalPage;
  sectionProps: ProposalV2SectionProps;
};
