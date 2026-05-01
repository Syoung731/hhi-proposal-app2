import { SignIn } from "@clerk/nextjs";

/**
 * Clerk-hosted sign-in UI rendered as a catch-all so Clerk can route its
 * own internal steps (verify-code, multi-factor, password reset, etc.)
 * under `/sign-in/*`. The catch-all wildcard `[[...sign-in]]` is required
 * by Clerk for path-based step routing.
 *
 * `proxy.ts` lists `/sign-in(.*)` as a public route so the middleware
 * doesn't redirect-loop visitors here.
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <SignIn />
    </div>
  );
}
