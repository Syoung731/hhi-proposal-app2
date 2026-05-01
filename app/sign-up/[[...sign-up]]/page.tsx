import Link from "next/link";

/**
 * Sign-up is **invitation-only** for the HHI Builders proposal app —
 * Steve provisions users via the Clerk dashboard. This route exists only
 * to render a polite message when someone lands here from an external
 * link or a Clerk-component-generated URL; we deliberately do NOT render
 * Clerk's `<SignUp />` component.
 *
 * If the policy changes (e.g. self-signup with email-domain restriction),
 * replace the body with `<SignUp />` and update the Clerk dashboard
 * settings to allow self-signup.
 */
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-3 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Account by invitation only
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          The HHI Builders proposal app is a private team deployment. If
          you need access, ask your administrator to invite you.
        </p>
        <Link
          href="/sign-in"
          className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}
