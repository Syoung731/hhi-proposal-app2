"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ICON_THUMB_SIZE = 24;
const ICON_THUMB_CLASS = "size-6 shrink-0 overflow-hidden rounded object-contain bg-zinc-100 dark:bg-zinc-800";

export type TemplateCIcon = { id: string; imageUrl: string; name?: string };

type TemplateCIconPickerProps = {
  icons: TemplateCIcon[];
  value: string | null;
  onChange: (iconId: string | null) => void;
  /** Optional label for the trigger (e.g. "Icon"). */
  label?: string;
};

export function TemplateCIconPicker({
  icons,
  value,
  onChange,
  label = "Icon",
}: TemplateCIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (value ? icons.find((i) => i.id === value) : null),
    [icons, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return icons;
    return icons.filter(
      (i) =>
        (i.name ?? i.id).toLowerCase().includes(q)
    );
  }, [icons, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = (iconId: string | null) => {
    onChange(iconId);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="flex flex-col">
      {label ? (
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-left text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          {selected ? (
            <>
              <span className={ICON_THUMB_CLASS}>
                <img
                  src={selected.imageUrl}
                  alt=""
                  width={ICON_THUMB_SIZE}
                  height={ICON_THUMB_SIZE}
                  className="size-full object-contain"
                />
              </span>
              <span className="min-w-0 truncate">{selected.name ?? selected.id}</span>
            </>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">No icon</span>
          )}
          <span className="ml-auto shrink-0 text-zinc-400" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </button>

        {open && (
          <div
            className="absolute left-0 right-0 top-full z-20 mt-1 flex flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            role="listbox"
          >
            <div className="border-b border-zinc-200 p-1.5 dark:border-zinc-700">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons…"
                className="w-full rounded border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                autoFocus
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => choose(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className={ICON_THUMB_CLASS} />
                <span className="text-zinc-500 dark:text-zinc-400">No icon</span>
              </button>
              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  No icons match
                </p>
              ) : (
                filtered.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    role="option"
                    aria-selected={value === icon.id}
                    onClick={() => choose(icon.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className={ICON_THUMB_CLASS}>
                      <img
                        src={icon.imageUrl}
                        alt=""
                        width={ICON_THUMB_SIZE}
                        height={ICON_THUMB_SIZE}
                        className="size-full object-contain"
                      />
                    </span>
                    <span className="min-w-0 truncate">{icon.name ?? icon.id}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
