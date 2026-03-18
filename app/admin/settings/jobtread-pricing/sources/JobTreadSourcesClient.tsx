'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  setProjectIncludeInPricing,
  setGroupIncludeInPricing,
  setItemIncludeInPricing,
  setGroupBenchmarkOverride,
} from './actions';
import { syncJobTreadPricingAction } from '@/app/admin/pricing/actions';

type ItemNode = {
  id: string;
  jobtreadItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  includeInPricing: boolean;
  extendedSell: number;
  extendedCost: number;
};

type GroupNode = {
  id: string;
  jobtreadGroupId: string;
  name: string;
  depth: number;
  normalizedPricingGroup: string | null;
  groupKind: string | null;
  isValidPricingGroup: boolean;
  includeInPricing: boolean;
  benchmarkGroupOverride: string | null;
  rollups: {
    sellTotal: number;
    costTotal: number;
    flooringSf: number;
    sellPerSf: number | null;
    costPerSf: number | null;
  };
  children: GroupNode[];
  items: ItemNode[];
};

type ProjectNode = {
  id: string;
  jobId: string;
  jobName: string;
  includeInPricing: boolean;
  lastSyncedAt: string | null;
  rollups: {
    sellTotal: number;
    costTotal: number;
    flooringSf: number;
    sellPerSf: number | null;
    costPerSf: number | null;
    officialSellTotal?: number | null;
    officialCostTotal?: number | null;
    analyticalSellTotal?: number;
    analyticalCostTotal?: number;
  };
  groups: GroupNode[];
  ungroupedItems: ItemNode[];
};

type Props = {
  projects: ProjectNode[];
};

type SelectionState = 'checked' | 'unchecked' | 'indeterminate';

type TriStateCheckboxProps = {
  state: SelectionState;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
};

function TriStateCheckbox({ state, checked, onChange, className }: TriStateCheckboxProps) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'indeterminate';
    }
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={className}
    />
  );
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function formatQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

function computeGroupSelectionState(group: GroupNode): SelectionState {
  let hasIncluded = group.includeInPricing;
  let hasExcluded = !group.includeInPricing;

  for (const item of group.items) {
    if (item.includeInPricing) hasIncluded = true;
    else hasExcluded = true;
  }

  for (const child of group.children) {
    const state = computeGroupSelectionState(child);
    if (state === 'checked') hasIncluded = true;
    if (state === 'unchecked') hasExcluded = true;
    if (state === 'indeterminate') {
      hasIncluded = true;
      hasExcluded = true;
    }
  }

  if (hasIncluded && hasExcluded) return 'indeterminate';
  if (hasIncluded) return 'checked';
  return 'unchecked';
}

function computeProjectSelectionState(project: ProjectNode): SelectionState {
  let hasIncluded = project.includeInPricing;
  let hasExcluded = !project.includeInPricing;

  for (const group of project.groups) {
    const state = computeGroupSelectionState(group);
    if (state === 'checked') hasIncluded = true;
    if (state === 'unchecked') hasExcluded = true;
    if (state === 'indeterminate') {
      hasIncluded = true;
      hasExcluded = true;
    }
  }

  for (const item of project.ungroupedItems) {
    if (item.includeInPricing) hasIncluded = true;
    else hasExcluded = true;
  }

  if (hasIncluded && hasExcluded) return 'indeterminate';
  if (hasIncluded) return 'checked';
  return 'unchecked';
}

type Filters = {
  search: string;
  mode: 'all' | 'included' | 'excluded';
  flooring: 'all' | 'hasFlooring' | 'missingFlooring';
};

const BENCHMARK_GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not a benchmark group' },
  { value: 'Kitchen', label: 'Kitchen' },
  { value: 'Bathroom', label: 'Bathroom' },
  { value: 'Primary Bathroom', label: 'Primary Bathroom' },
  { value: 'Guest Bathroom', label: 'Guest Bathroom' },
  { value: 'Bedroom', label: 'Bedroom' },
  { value: 'Living Room', label: 'Living Room' },
  { value: 'Dining Room', label: 'Dining Room' },
  { value: 'Entry', label: 'Entry' },
  { value: 'Hall', label: 'Hall' },
  { value: 'Laundry', label: 'Laundry' },
  { value: 'Pantry', label: 'Pantry' },
  { value: 'Office', label: 'Office' },
  { value: 'Closet', label: 'Closet' },
  { value: 'Deck', label: 'Deck' },
  { value: 'Porch', label: 'Porch' },
  { value: 'Screened Porch', label: 'Screened Porch' },
  { value: 'Exterior', label: 'Exterior' },
  { value: 'Pool', label: 'Pool' },
  { value: 'Garage', label: 'Garage' },
  { value: 'Driveway', label: 'Driveway' },
  { value: 'Landscaping', label: 'Landscaping' },
  { value: 'Addition', label: 'Addition' },
];

function projectMatchesFilters(project: ProjectNode, filters: Filters): boolean {
  const search = filters.search.trim().toLowerCase();

  function nodeMatches(
    proj: ProjectNode,
    group: GroupNode | null,
    item: ItemNode | null,
  ): boolean {
    let textMatch = true;
    if (search) {
      const haystack = [proj.jobName, group?.name ?? '', item?.name ?? '']
        .join(' ')
        .toLowerCase();
      textMatch = haystack.includes(search);
    }

    let includeMatch = true;
    if (filters.mode === 'included') {
      const included =
        (item?.includeInPricing ??
          group?.includeInPricing ??
          proj.includeInPricing) === true;
      includeMatch = included;
    } else if (filters.mode === 'excluded') {
      const included =
        (item?.includeInPricing ??
          group?.includeInPricing ??
          proj.includeInPricing) === true;
      includeMatch = !included;
    }

    let flooringMatch = true;
    if (filters.flooring === 'hasFlooring') {
      const flooring =
        (group?.rollups.flooringSf ?? proj.rollups.flooringSf) > 0;
      flooringMatch = flooring;
    } else if (filters.flooring === 'missingFlooring') {
      const flooring =
        (group?.rollups.flooringSf ?? proj.rollups.flooringSf) > 0;
      flooringMatch = !flooring;
    }

    return textMatch && includeMatch && flooringMatch;
  }

  function groupTreeMatches(group: GroupNode): boolean {
    if (nodeMatches(project, group, null)) return true;
    for (const item of group.items) {
      if (nodeMatches(project, group, item)) return true;
    }
    for (const child of group.children) {
      if (groupTreeMatches(child)) return true;
    }
    return false;
  }

  if (nodeMatches(project, null, null)) return true;

  for (const item of project.ungroupedItems) {
    if (nodeMatches(project, null, item)) return true;
  }

  for (const group of project.groups) {
    if (groupTreeMatches(group)) return true;
  }

  return false;
}

type GroupNodeRowProps = {
  group: GroupNode;
  expandedGroups: Set<string>;
  onToggleGroupExpansion: (id: string) => void;
  onToggleGroupInclude: (group: GroupNode, nextChecked: boolean) => void;
  onToggleItemInclude: (item: ItemNode, nextChecked: boolean) => void;
  onChangeBenchmarkOverride: (group: GroupNode, value: string) => void;
};

function GroupNodeRow({
  group,
  expandedGroups,
  onToggleGroupExpansion,
  onToggleGroupInclude,
  onToggleItemInclude,
  onChangeBenchmarkOverride,
}: GroupNodeRowProps) {
  const selection = computeGroupSelectionState(group);
  const isExpanded = expandedGroups.has(group.id);
  const isTopLevel = group.depth === 0;

  const BASE_INDENT_PX = 4;
  const INDENT_STEP_PX = 16;
  const rowBackgroundClass = isTopLevel
    ? 'bg-zinc-100 dark:bg-zinc-800/70'
    : 'bg-white dark:bg-zinc-950';

  const rowBorderClass = isTopLevel
    ? ''
    : 'border-t border-black/[0.14] dark:border-white/[0.14]';

  const sectionWrapperClass = isTopLevel
    ? 'mt-3 first:mt-0 border-t-2 border-zinc-400 dark:border-zinc-500'
    : '';

  return (
    <div className={sectionWrapperClass}>
      <div
        className={`flex items-center justify-between gap-4 px-3 py-1.5 text-[11px] ${rowBackgroundClass} ${rowBorderClass}`}
        style={
          isTopLevel ? { borderTop: '2px solid rgb(161, 161, 170)' } : undefined
        }
      >
        <div
          className="relative flex min-w-0 items-center gap-2"
          style={{
            paddingLeft: `${BASE_INDENT_PX + (group.depth + 1) * INDENT_STEP_PX}px`,
          }}
        >
          {group.depth > 0 && (
            <span
              className="pointer-events-none absolute left-0 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700"
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            onClick={() => onToggleGroupExpansion(group.id)}
            className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-zinc-300 text-[10px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isExpanded ? '−' : '+'}
          </button>
          <div className="flex min-w-0 flex-col">
            <div
              className={`truncate ${
                isTopLevel
                  ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                  : 'font-normal text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {group.name}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              {isTopLevel ? 'Room / area group' : 'Trade / detail group'}
            </div>
            {isTopLevel && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span>Benchmark bucket:</span>
                <select
                  className="h-6 rounded-md border border-zinc-300 bg-white px-1.5 text-[11px] text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={group.benchmarkGroupOverride ?? ''}
                  onChange={(e) => onChangeBenchmarkOverride(group, e.target.value)}
                >
                  {BENCHMARK_GROUP_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-baseline text-[11px] text-zinc-700 dark:text-zinc-300">
          <div className="w-20 text-right">
            <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
              Qty
            </div>
            <div className="text-zinc-500 dark:text-zinc-400">—</div>
          </div>
          <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
            <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
              Sell
            </div>
            <div className="text-zinc-900 dark:text-zinc-100">
              {formatMoney(group.rollups.sellTotal)}
            </div>
          </div>
          <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
            <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
              Cost
            </div>
            <div className="text-zinc-900 dark:text-zinc-100">
              {formatMoney(group.rollups.costTotal)}
            </div>
          </div>
          <div className="flex w-10 flex-shrink-0 items-center justify-center border-l border-zinc-200 pl-2 dark:border-zinc-800">
            <TriStateCheckbox
              state={selection}
              checked={selection === 'checked'}
              onChange={(e) => onToggleGroupInclude(group, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
      </div>
      {isExpanded && (
        <div>
          {group.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 border-t border-black/[0.08] bg-white px-3 py-1.25 text-[11px] dark:border-white/[0.08] dark:bg-zinc-950"
            >
              <div
                className="relative flex min-w-0 items-center gap-2"
                style={{
                  paddingLeft: `${BASE_INDENT_PX + (group.depth + 3) * INDENT_STEP_PX}px`,
                }}
              >
                <span
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700"
                  aria-hidden="true"
                />
                <span className="inline-block h-4 w-4 flex-shrink-0" />
                <div className="flex min-w-0 flex-col">
                  <div className="truncate text-[10px] font-normal text-zinc-600 dark:text-zinc-400">
                    {item.name}
                  </div>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-baseline text-[11px] text-zinc-700 dark:text-zinc-300">
                <div className="w-20 text-right">
                  <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
                    Qty
                  </div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatQuantity(item.quantity)}
                  </div>
                </div>
                <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
                  <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
                    Sell
                  </div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatMoney(item.extendedSell)}
                  </div>
                </div>
                <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
                  <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
                    Cost
                  </div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatMoney(item.extendedCost)}
                  </div>
                </div>
                <div className="flex w-10 flex-shrink-0 items-center justify-center border-l border-zinc-200 pl-2 dark:border-zinc-800">
                  <input
                    type="checkbox"
                    checked={item.includeInPricing}
                    onChange={(e) => onToggleItemInclude(item, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>
          ))}
          {group.children.map((child) => (
            <GroupNodeRow
              key={child.id}
              group={child}
              expandedGroups={expandedGroups}
              onToggleGroupExpansion={onToggleGroupExpansion}
              onToggleGroupInclude={onToggleGroupInclude}
              onToggleItemInclude={onToggleItemInclude}
              onChangeBenchmarkOverride={onChangeBenchmarkOverride}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ProjectCardProps = {
  project: ProjectNode;
  expandedProjects: Set<string>;
  expandedGroups: Set<string>;
  onToggleProjectExpansion: (id: string) => void;
  onToggleGroupExpansion: (id: string) => void;
  onToggleProjectInclude: (project: ProjectNode, nextChecked: boolean) => void;
  onToggleGroupInclude: (group: GroupNode, nextChecked: boolean) => void;
  onToggleItemInclude: (item: ItemNode, nextChecked: boolean) => void;
  onChangeBenchmarkOverride: (group: GroupNode, value: string) => void;
};

function ProjectCard({
  project,
  expandedProjects,
  expandedGroups,
  onToggleProjectExpansion,
  onToggleGroupExpansion,
  onToggleProjectInclude,
  onToggleGroupInclude,
  onToggleItemInclude,
  onChangeBenchmarkOverride,
}: ProjectCardProps) {
  const selection = computeProjectSelectionState(project);
  const isExpanded = expandedProjects.has(project.id);

  return (
    <div className="bg-zinc-50 text-xs dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4 border-t border-zinc-300 px-3 py-1.75 first:border-t-0 dark:border-zinc-700">
        <div
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: '4px' }}
        >
          <button
            type="button"
            onClick={() => onToggleProjectExpansion(project.id)}
            className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-zinc-300 text-[10px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isExpanded ? '−' : '+'}
          </button>
          <div className="flex min-w-0 flex-col">
            <div className="truncate text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
              {project.jobName}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              Job ID:{' '}
              <span className="font-mono text-[10px]">
                {project.jobId}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-baseline text-[11px] text-zinc-700 dark:text-zinc-300">
          {(() => {
            const analyticalSell =
              project.rollups.analyticalSellTotal ?? project.rollups.sellTotal;
            const analyticalCost =
              project.rollups.analyticalCostTotal ?? project.rollups.costTotal;
            const officialSell =
              project.rollups.officialSellTotal ?? analyticalSell;
            const officialCost =
              project.rollups.officialCostTotal ?? analyticalCost;
            return (
              <>
                <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
                  <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-400">
                    Sell
                  </div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    <div>
                      <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                        Official (Matched)
                      </span>{' '}
                      {formatMoney(officialSell)}
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Analytical {formatMoney(analyticalSell)}
                    </div>
                  </div>
                </div>
                <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
                  <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-400">
                    Cost
                  </div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    <div>
                      <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                        Official (Matched)
                      </span>{' '}
                      {formatMoney(officialCost)}
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Analytical {formatMoney(analyticalCost)}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
          <div className="flex w-10 flex-shrink-0 items-center justify-center border-l border-zinc-200 pl-2 dark:border-zinc-800">
            <TriStateCheckbox
              state={selection}
              checked={selection === 'checked'}
              onChange={(e) => onToggleProjectInclude(project, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="pb-2">
          {project.groups.map((group) => (
            <GroupNodeRow
              key={group.id}
              group={group}
              expandedGroups={expandedGroups}
              onToggleGroupExpansion={onToggleGroupExpansion}
              onToggleGroupInclude={onToggleGroupInclude}
              onToggleItemInclude={onToggleItemInclude}
              onChangeBenchmarkOverride={onChangeBenchmarkOverride}
            />
          ))}
          {project.ungroupedItems.length > 0 && (
            <div className="mt-2 border-t border-zinc-200 pt-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <div className="px-4 pb-1 font-medium">
                Ungrouped line items
              </div>
              {project.ungroupedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-t border-zinc-100 px-3 py-1.5 text-[11px] first:border-t-0 dark:border-zinc-800"
                >
                  <div
                    className="flex min-w-0 items-center gap-2"
                    style={{ paddingLeft: '52px' }}
                  >
                    <span className="inline-block h-4 w-4 flex-shrink-0" />
                    <div className="truncate text-zinc-900 dark:text-zinc-100">
                      {item.name}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-baseline text-[11px] text-zinc-700 dark:text-zinc-300">
                    <div className="w-20 text-right">
                      <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
                        Qty
                      </div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatQuantity(item.quantity)}
                      </div>
                    </div>
                    <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
                      <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
                        Sell
                      </div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatMoney(item.extendedSell)}
                      </div>
                    </div>
                    <div className="w-24 border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">
                      <div className="uppercase tracking-wide text-[10px] text-zinc-500 dark:text-zinc-500">
                        Cost
                      </div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatMoney(item.extendedCost)}
                      </div>
                    </div>
                    <div className="flex w-10 flex-shrink-0 items-center justify-center border-l border-zinc-200 pl-2 dark:border-zinc-800">
                      <input
                        type="checkbox"
                        checked={item.includeInPricing}
                        onChange={(e) =>
                          onToggleItemInclude(item, e.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function JobTreadSourcesClient({ projects }: Props) {
  const [projectsState] = useState<ProjectNode[]>(projects);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<Filters>({
    search: '',
    mode: 'all',
    flooring: 'all',
  });
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredProjects = useMemo(
    () => projectsState.filter((p) => projectMatchesFilters(p, filters)),
    [projectsState, filters],
  );

  function toggleProjectExpansion(id: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupExpansion(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleProjectInclude(project: ProjectNode, nextChecked: boolean) {
    startTransition(async () => {
      await setProjectIncludeInPricing(project.id, nextChecked);
    });
  }

  function handleGroupInclude(group: GroupNode, nextChecked: boolean) {
    startTransition(async () => {
      await setGroupIncludeInPricing(group.id, nextChecked);
    });
  }

  function handleItemInclude(item: ItemNode, nextChecked: boolean) {
    startTransition(async () => {
      await setItemIncludeInPricing(item.id, nextChecked);
    });
  }

  function handleGroupBenchmarkOverride(group: GroupNode, value: string) {
    const normalizedValue = value.trim() === '' ? null : value;

    startTransition(async () => {
      await setGroupBenchmarkOverride(group.id, normalizedValue);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 text-xs dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/settings/jobtread-pricing"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ← Back to Pricing
          </Link>
          <Link
            href="/admin/settings/jobtread-pricing/debug"
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open Debug
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            startTransition(async () => {
              const result = await syncJobTreadPricingAction();
              if (!result.ok) {
                setToast({
                  kind: 'error',
                  message: result.error ?? 'Failed to sync JobTread data.',
                });
              } else {
                const stats = result.stats;
                setToast({
                  kind: 'success',
                  message: stats
                    ? stats.buildJobsFound === 0
                      ? 'No Build jobs found.'
                      : `${stats.buildJobsFound} Build jobs found; ${stats.jobsSynced} synced (${stats.jobsNew} new, ${stats.jobsChanged} changed), ${stats.jobsSkippedUnchanged} skipped (unchanged).`
                    : 'Sync completed.',
                });
              }
            });
          }}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? 'Syncing…' : 'Sync JobTread Data'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 text-xs dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
            placeholder="Search project, group, or item…"
            className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={filters.mode === 'included'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  mode: e.target.checked ? 'included' : 'all',
                }))
              }
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span>Only included</span>
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={filters.mode === 'excluded'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  mode: e.target.checked ? 'excluded' : 'all',
                }))
              }
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span>Only excluded</span>
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={filters.flooring === 'hasFlooring'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  flooring: e.target.checked ? 'hasFlooring' : 'all',
                }))
              }
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span>With flooring SF</span>
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={filters.flooring === 'missingFlooring'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  flooring: e.target.checked ? 'missingFlooring' : 'all',
                }))
              }
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span>Missing flooring SF</span>
          </label>
        </div>
        {isPending && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Saving changes…
          </div>
        )}
      </div>

      {filteredProjects.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No projects match the current filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <div>Name / Source</div>
            <div className="flex flex-shrink-0 items-center text-right">
              <div className="w-20">Qty</div>
              <div className="w-24 border-l border-zinc-200 pl-4 dark:border-zinc-800">
                Sell
              </div>
              <div className="w-24 border-l border-zinc-200 pl-4 dark:border-zinc-800">
                Cost
              </div>
              <div className="w-10 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                Include
              </div>
            </div>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                expandedProjects={expandedProjects}
                expandedGroups={expandedGroups}
                onToggleProjectExpansion={toggleProjectExpansion}
                onToggleGroupExpansion={toggleGroupExpansion}
                onToggleProjectInclude={handleProjectInclude}
                onToggleGroupInclude={handleGroupInclude}
                onToggleItemInclude={handleItemInclude}
                onChangeBenchmarkOverride={handleGroupBenchmarkOverride}
              />
            ))}
          </div>
        </div>
      )}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transform rounded-md px-3 py-2 text-xs font-medium shadow-lg ${
            toast.kind === 'success'
              ? 'bg-green-600 text-white dark:bg-green-400 dark:text-zinc-900'
              : 'bg-red-600 text-white dark:bg-red-400 dark:text-zinc-900'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

