import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-light text-zinc-800" style={{ fontFamily: "Cormorant Garamond, serif" }}>
        Proposal not found
      </h1>
      <p className="max-w-md text-sm text-zinc-600">
        This proposal link is no longer available. Please contact HHI Builders for an updated link.
      </p>
      <Link
        href="https://hhibuilders.com"
        className="mt-4 text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-700"
      >
        hhibuilders.com
      </Link>
    </div>
  );
}
