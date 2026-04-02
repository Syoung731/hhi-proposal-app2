"use client";

import { useCallback, useState } from "react";
import type { ProposalPageConfig } from "./page-model";
import {
  movePageUp,
  movePageDown,
  duplicatePage,
  removePage,
  addPage,
  setPageLayoutKey,
  setPageEnabled,
} from "./page-utils";

export type ProposalPageConfigActions = {
  setLayoutKey: (id: string, layoutKey: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  toggleEnabled: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  addPageByType: (type: Parameters<typeof addPage>[1]) => void;
  setPages: React.Dispatch<React.SetStateAction<ProposalPageConfig>>;
};

/**
 * Client-side state for the page builder. Initialized from mock (or later from server).
 * All mutations go through page-utils for consistent ordering.
 */
export function useProposalPageConfigState(
  initialConfig: ProposalPageConfig
): [ProposalPageConfig, ProposalPageConfigActions] {
  const [pages, setPages] = useState<ProposalPageConfig>(initialConfig);

  const setLayoutKey = useCallback((id: string, layoutKey: string) => {
    setPages((prev) => setPageLayoutKey(prev, id, layoutKey));
  }, []);

  const moveUp = useCallback((id: string) => {
    setPages((prev) => movePageUp(prev, id));
  }, []);

  const moveDown = useCallback((id: string) => {
    setPages((prev) => movePageDown(prev, id));
  }, []);

  const toggleEnabled = useCallback((id: string) => {
    setPages((prev) => {
      const p = prev.find((x) => x.id === id);
      return setPageEnabled(prev, id, !p?.isEnabled);
    });
  }, []);

  const duplicate = useCallback((id: string) => {
    setPages((prev) => duplicatePage(prev, id));
  }, []);

  const remove = useCallback((id: string) => {
    setPages((prev) => removePage(prev, id));
  }, []);

  const addPageByType = useCallback((type: Parameters<typeof addPage>[1]) => {
    setPages((prev) => addPage(prev, type));
  }, []);

  const actions: ProposalPageConfigActions = {
    setLayoutKey,
    moveUp,
    moveDown,
    toggleEnabled,
    duplicate,
    remove,
    addPageByType,
    setPages,
  };

  return [pages, actions];
}
