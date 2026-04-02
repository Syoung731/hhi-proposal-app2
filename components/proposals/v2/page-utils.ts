import type { ProposalPage, ProposalPageConfig, PageType } from "./page-model";
import { LAYOUT_KEYS } from "./page-model";

function sortedPages(config: ProposalPageConfig): ProposalPage[] {
  return [...config].sort((a, b) => a.order - b.order);
}

/** Set layoutKey for a page. */
export function setPageLayoutKey(
  config: ProposalPageConfig,
  id: string,
  layoutKey: string
): ProposalPageConfig {
  return config.map((p) => (p.id === id ? { ...p, layoutKey } : p));
}

/** Toggle or set isEnabled for a page. */
export function setPageEnabled(
  config: ProposalPageConfig,
  id: string,
  isEnabled: boolean
): ProposalPageConfig {
  return config.map((p) => (p.id === id ? { ...p, isEnabled } : p));
}

/** Move page with id one position up. */
export function movePageUp(config: ProposalPageConfig, id: string): ProposalPageConfig {
  const sorted = sortedPages(config);
  const idx = sorted.findIndex((p) => p.id === id);
  if (idx <= 0) return config;
  const swapped = sorted[idx];
  const prev = sorted[idx - 1];
  return config.map((p) => {
    if (p.id === swapped.id) return { ...p, order: prev.order };
    if (p.id === prev.id) return { ...p, order: swapped.order };
    return p;
  });
}

/** Move page with id one position down. */
export function movePageDown(config: ProposalPageConfig, id: string): ProposalPageConfig {
  const sorted = sortedPages(config);
  const idx = sorted.findIndex((p) => p.id === id);
  if (idx < 0 || idx >= sorted.length - 1) return config;
  const swapped = sorted[idx];
  const next = sorted[idx + 1];
  return config.map((p) => {
    if (p.id === swapped.id) return { ...p, order: next.order };
    if (p.id === next.id) return { ...p, order: swapped.order };
    return p;
  });
}

/** Duplicate page; new page gets new id and order after original. */
export function duplicatePage(config: ProposalPageConfig, id: string): ProposalPageConfig {
  const page = config.find((p) => p.id === id);
  if (!page) return config;
  const newId = `page-${id}-copy-${Date.now()}`;
  const newPage: ProposalPage = {
    ...page,
    id: newId,
    order: page.order + 1,
  };
  const withBumped = config.map((p) =>
    p.order > page.order ? { ...p, order: p.order + 1 } : p
  );
  return sortedPages([...withBumped, newPage]);
}

/** Remove page and renumber orders. */
export function removePage(config: ProposalPageConfig, id: string): ProposalPageConfig {
  const removed = config.filter((p) => p.id !== id);
  return sortedPages(removed).map((p, i) => ({ ...p, order: i }));
}

/** Add a new page of the given type. Uses first layout key for that type. */
export function addPage(config: ProposalPageConfig, type: PageType): ProposalPageConfig {
  const keys = LAYOUT_KEYS[type];
  const layoutKey = keys.length > 0 ? keys[0] : "default";
  const maxOrder = config.length === 0 ? -1 : Math.max(...config.map((p) => p.order));
  const newPage: ProposalPage = {
    id: `page-${type}-${Date.now()}`,
    type,
    layoutKey,
    order: maxOrder + 1,
    isEnabled: true,
    title: null,
    dataSource: "snapshot",
    overrides: null,
  };
  return [...config, newPage];
}
