"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPresignedUploadUrlAction,
  createMediaAction,
  updateMediaAction,
  deleteMediaAction,
  moveMediaOrderAction,
} from "./actions";
import { MediaKind } from "@/app/generated/prisma";

const KINDS: { value: MediaKind; label: string }[] = [
  { value: MediaKind.COVER, label: "Cover" },
  { value: MediaKind.BEFORE, label: "Before" },
  { value: MediaKind.AFTER, label: "After" },
  { value: MediaKind.INSPIRATION, label: "Inspiration" },
  { value: MediaKind.PLAN, label: "Plan" },
  { value: MediaKind.TEAM, label: "Team" },
  { value: MediaKind.OTHER, label: "Other" },
];

type MediaWithRoom = {
  id: string;
  kind: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  room: { id: string; roomType: string; roomLabel: string | null } | null;
};

type RoomOption = { id: string; roomType: string; roomLabel: string | null };

type Props = {
  projectId: string;
  media: MediaWithRoom[];
  rooms: RoomOption[];
};

export function MediaTab({ projectId, media: initialMedia, rooms }: Props) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<string>("");
  const [filterTag, setFilterTag] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const allTags = Array.from(
    new Set(initialMedia.flatMap((m) => m.tags))
  ).sort();
  const filtered = initialMedia.filter((m) => {
    if (filterKind && m.kind !== filterKind) return false;
    if (filterTag && !m.tags.includes(filterTag)) return false;
    return true;
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await getPresignedUploadUrlAction(
        projectId,
        file.name,
        file.type || "application/octet-stream"
      );
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        setUploadError("Upload failed: " + putRes.statusText);
        return;
      }
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("fileKey", result.fileKey);
      formData.set("url", result.publicUrl);
      formData.set("kind", MediaKind.OTHER);
      const create = await createMediaAction(formData);
      if (create.error) setUploadError(create.error);
      else router.refresh();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(mediaId: string) {
    if (!confirm("Delete this media?")) return;
    await deleteMediaAction(projectId, mediaId);
    router.refresh();
  }

  async function handleMove(mediaId: string, direction: "up" | "down") {
    await moveMediaOrderAction(projectId, mediaId, direction);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={handleUpload}
          />
          {uploading ? "Uploading…" : "Upload image"}
        </label>
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {uploadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="w-20 px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Thumb
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Kind
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Caption / Tags
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Room
              </th>
              <th className="w-32 px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Order
              </th>
              <th className="w-24 px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No media. Upload an image to get started.
                </td>
              </tr>
            ) : (
              filtered.map((m, i) => (
                <tr
                  key={m.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-2">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-14 w-14 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {m.kind}
                  </td>
                  <td className="px-4 py-2">
                    {editingId === m.id ? (
                      <MediaEditForm
                        projectId={projectId}
                        media={m}
                        rooms={rooms}
                        onDone={() => {
                          setEditingId(null);
                          router.refresh();
                        }}
                        onCancel={() => setEditingId(null)}
                        updateAction={updateMediaAction}
                      />
                    ) : (
                      <div>
                        <p className="text-zinc-900 dark:text-zinc-100">
                          {m.caption || "—"}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500">
                          {m.tags.length ? m.tags.join(", ") : "—"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingId(m.id)}
                          className="mt-1 text-xs text-zinc-600 hover:underline dark:text-zinc-400"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {m.room
                      ? m.room.roomType + (m.room.roomLabel ? ` (${m.room.roomLabel})` : "")
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleMove(m.id, "up")}
                        disabled={i === 0}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-50 dark:border-zinc-600"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(m.id, "down")}
                        disabled={i === filtered.length - 1}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-50 dark:border-zinc-600"
                      >
                        Down
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MediaEditForm({
  projectId,
  media,
  rooms,
  onDone,
  onCancel,
  updateAction,
}: {
  projectId: string;
  media: MediaWithRoom;
  rooms: RoomOption[];
  onDone: () => void;
  onCancel: () => void;
  updateAction: typeof updateMediaAction;
}) {
  const [caption, setCaption] = useState(media.caption ?? "");
  const [tags, setTags] = useState(media.tags.join(", "));
  const [kind, setKind] = useState(media.kind);
  const [roomId, setRoomId] = useState(media.roomId ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData();
    formData.set("caption", caption);
    formData.set("tags", tags);
    formData.set("kind", kind);
    formData.set("roomId", roomId);
    await updateAction(projectId, media.id, formData);
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption"
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="text"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma separated)"
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as MediaKind)}
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <select
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      >
        <option value="">No room</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.roomType}
            {r.roomLabel ? ` - ${r.roomLabel}` : ""}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
