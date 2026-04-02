import { ProposalScopeModules } from "../ProposalScopeModules";
import type { ProposalLayoutProps } from "./types";

/** scope.room-cards — card grid with optional alternating image. */
export function ScopeRoomCards({ page, sectionProps }: ProposalLayoutProps) {
  const s = sectionProps.scopeModules;
  return (
    <ProposalScopeModules
      title={page.title ?? s.title}
      modules={s.modules}
      alternateLayout={false}
    />
  );
}

/** scope.alternating-story — alternating image/text blocks. */
export function ScopeAlternatingStory({ page, sectionProps }: ProposalLayoutProps) {
  const s = sectionProps.scopeModules;
  return (
    <ProposalScopeModules
      title={page.title ?? s.title}
      modules={s.modules}
      alternateLayout
    />
  );
}
