"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  createTestimonialAction,
  updateTestimonialAction,
  deleteTestimonialAction,
  reorderTestimonialsAction,
} from "../actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type TestimonialRow = {
  id: string;
  quote: string;
  clientName: string;
  projectName: string | null;
  rating: number;
  source: string;
  approved: boolean;
  sortOrder: number;
};

type Props = {
  initialTestimonials: TestimonialRow[];
};

// ─── Google Reviews Sync Section ────────────────────────────────────────────

type GoogleReview = {
  id: string;
  reviewerName: string;
  rating: number;
  text: string;
  relativeTime: string;
};

function GoogleReviewsSync({ onImport }: { onImport: (review: GoogleReview) => void }) {
  const [reviews, setReviews] = useState<GoogleReview[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/google-reviews/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sync failed");
        return;
      }
      setReviews(data.reviews ?? []);
      setLastSyncAt(data.syncedAt);
    } catch {
      setError("Network error");
    } finally {
      setSyncing(false);
    }
  }

  function handleImport(review: GoogleReview) {
    onImport(review);
    setImported((prev) => new Set(prev).add(review.id));
  }

  const stars = (rating: number) => "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Google Reviews
        </h3>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {syncing ? "Syncing\u2026" : reviews.length > 0 ? "Sync Again" : "Sync from Google"}
        </button>
      </div>

      {lastSyncAt && (
        <p className="text-xs text-zinc-500 mb-2">
          Last synced: {new Date(lastSyncAt).toLocaleString()}
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
          {error.includes("not configured") && (
            <a
              href="/admin/settings/integrations"
              className="block mt-1 underline text-red-600 dark:text-red-400"
            >
              Configure in Settings &rarr; Integrations
            </a>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-500 mb-3">
        Google Places API returns up to 5 reviews. Import them to your library for editing and approval.
      </p>

      {reviews.length > 0 && (
        <div className="space-y-2">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {review.reviewerName}
                </span>
                <span className="text-xs text-amber-600">{stars(review.rating)}</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-3">
                {review.text}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">{review.relativeTime}</span>
                {imported.has(review.id) ? (
                  <span className="text-xs text-green-600 font-medium">Imported</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleImport(review)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    Import to Library
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TestimonialsSettingsClient({ initialTestimonials }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<TestimonialRow[]>(initialTestimonials);
  const [saving, setSaving] = useState(false);

  // New testimonial form state
  const [newQuote, setNewQuote] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newRating, setNewRating] = useState(5);

  const moveItem = useCallback((idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      // Persist reorder
      reorderTestimonialsAction(updated.map((t) => t.id));
      return updated;
    });
  }, []);

  async function handleAdd() {
    if (!newQuote.trim() || !newClientName.trim()) return;
    setSaving(true);
    await createTestimonialAction({
      quote: newQuote.trim(),
      clientName: newClientName.trim(),
      projectName: newProjectName.trim() || undefined,
      rating: newRating,
      source: "manual",
      approved: true,
    });
    setNewQuote("");
    setNewClientName("");
    setNewProjectName("");
    setNewRating(5);
    setSaving(false);
    router.refresh();
  }

  async function handleToggleApproved(id: string, approved: boolean) {
    await updateTestimonialAction(id, { approved });
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, approved } : t)));
  }

  async function handleDelete(id: string) {
    await deleteTestimonialAction(id);
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleImportGoogleReview(review: GoogleReview) {
    await createTestimonialAction({
      quote: review.text,
      clientName: review.reviewerName,
      rating: review.rating,
      source: "google",
      approved: false, // Imported reviews start unapproved
    });
    router.refresh();
  }

  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Testimonial Library
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Curated testimonials available for use in proposal slide decks. Only approved testimonials appear in the slide editor.
        </p>
      </header>

      <div className="space-y-6 max-w-3xl">
        {/* Existing testimonials */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Library ({items.length})</label>
          </div>

          <div className="space-y-3">
            {items.map((t, ti) => (
              <div
                key={t.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {t.clientName}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.source === "google"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-800/30 dark:text-blue-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}>
                      {t.source === "google" ? "Google" : "Manual"}
                    </span>
                    <span className="text-xs text-amber-600">
                      {"\u2605".repeat(t.rating)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveItem(ti, -1)} disabled={ti === 0} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700">▲</button>
                    <button type="button" onClick={() => moveItem(ti, 1)} disabled={ti === items.length - 1} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700">▼</button>
                    <button type="button" onClick={() => handleDelete(t.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
                  </div>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                {t.projectName && (
                  <p className="text-xs text-zinc-500 mb-2">{t.projectName}</p>
                )}
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={t.approved}
                    onChange={(e) => handleToggleApproved(t.id, e.target.checked)}
                  />
                  Approved for proposals
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Add new testimonial */}
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
            Add Testimonial
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Quote</label>
              <textarea
                value={newQuote}
                onChange={(e) => setNewQuote(e.target.value)}
                placeholder="Client testimonial text"
                rows={3}
                className={inputClass + " resize-y"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Client Name</label>
                <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Jane Doe" className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Project Name (optional)</label>
                <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Kitchen Renovation" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Rating</label>
              <select value={newRating} onChange={(e) => setNewRating(Number(e.target.value))} className={inputClass} style={{ maxWidth: 120 }}>
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>{r} star{r !== 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleAdd} disabled={saving || !newQuote.trim() || !newClientName.trim()} className={btnClass}>
              {saving ? "Adding\u2026" : "Add Testimonial"}
            </button>
          </div>
        </div>

        {/* Google Reviews sync */}
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <GoogleReviewsSync onImport={handleImportGoogleReview} />
        </div>
      </div>
    </div>
  );
}
