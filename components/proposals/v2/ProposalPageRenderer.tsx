import type { ProposalPage } from "./page-model";
import type { ProposalV2SectionProps } from "./mock-data-adapter";
import { getLayoutComponent } from "./layouts/registry";

export type ProposalPageRendererProps = {
  page: ProposalPage;
  sectionProps: ProposalV2SectionProps;
};

/**
 * Renders a single proposal page by looking up the layout component from the registry
 * (type + layoutKey) and passing page config + section data.
 */
export function ProposalPageRenderer({
  page,
  sectionProps,
}: ProposalPageRendererProps) {
  if (!page.isEnabled) return null;

  const Component = getLayoutComponent(page.type, page.layoutKey);
  if (!Component) return null;

  return <Component page={page} sectionProps={sectionProps} />;
}
