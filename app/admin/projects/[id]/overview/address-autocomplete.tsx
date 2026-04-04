"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Google Places Autocomplete for address search.
 * Uses a server-side proxy at /api/settings/google-places-key to call the
 * Places REST API — no Google Maps JS SDK needed, no CORS issues, no script tags.
 *
 * Renders nothing when no API key is configured in Settings > Integrations.
 */

type Suggestion = {
  placeId: string;
  description: string;
};

type AddressFields = {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
};

type Props = {
  onSelect: (fields: AddressFields) => void;
  inputClass: string;
};

const PROXY_URL = "/api/settings/google-places-key";

// Module-level cache
let cachedConfigured: boolean | undefined;

async function checkConfigured(): Promise<boolean> {
  if (cachedConfigured !== undefined) return cachedConfigured;
  try {
    const res = await fetch(PROXY_URL);
    const data = await res.json();
    cachedConfigured = !!data.configured;
  } catch {
    cachedConfigured = false;
  }
  return cachedConfigured;
}

export function AddressAutocomplete({ onSelect, inputClass }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if API key is configured on mount
  useEffect(() => {
    let cancelled = false;
    checkConfigured().then((ok) => {
      if (cancelled) return;
      if (ok) setReady(true);
      else setHidden(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "autocomplete", input }),
      });
      const data = await res.json();
      if (data.status === "OK" && data.predictions) {
        setSuggestions(
          data.predictions.map((p: { place_id: string; description: string }) => ({
            placeId: p.place_id,
            description: p.description,
          }))
        );
        setShowDropdown(true);
        setActiveIndex(-1);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    }
  }, []);

  const selectPlace = useCallback(async (placeId: string) => {
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "details", placeId }),
      });
      const data = await res.json();
      if (data.status !== "OK" || !data.result?.address_components) return;

      const components: Array<{ long_name: string; short_name: string; types: string[] }> =
        data.result.address_components;
      const get = (type: string) =>
        components.find((c) => c.types.includes(type))?.long_name ?? "";
      const getShort = (type: string) =>
        components.find((c) => c.types.includes(type))?.short_name ?? "";

      const streetNumber = get("street_number");
      const route = get("route");
      const addressLine1 = [streetNumber, route].filter(Boolean).join(" ");
      const city = get("locality") || get("sublocality_level_1") || get("administrative_area_level_2");
      const state = getShort("administrative_area_level_1");
      const zip = get("postal_code");

      onSelect({ addressLine1, city, state, zip });
      setQuery(addressLine1);
      setShowDropdown(false);
      setSuggestions([]);
    } catch {
      // Silently fail — user can still type address manually
    }
  }, [onSelect]);

  // Don't render if no API key configured
  if (hidden) return null;

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        selectPlace(suggestions[activeIndex].placeId);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-0.5 block text-xs text-zinc-500">
        Address search
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={ready ? "Start typing an address..." : "Loading..."}
        disabled={!ready}
        className={inputClass}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIndex
                  ? "bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
              onMouseDown={() => selectPlace(s.placeId)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
