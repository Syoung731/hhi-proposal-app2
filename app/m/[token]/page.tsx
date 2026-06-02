import { prisma } from "@/app/lib/prisma";
import { PhoneUploader } from "./PhoneUploader";

/**
 * Public mobile upload page reached by scanning the QR code from the admin
 * Media tab. No Clerk login — the <token> in the URL is the credential
 * (validated here and on every API call). Photos land in the project's
 * Unassigned bucket for the salesperson to review.
 */

export const dynamic = "force-dynamic";

export default async function PhoneUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await prisma.photoUploadToken.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      revokedAt: true,
      project: { select: { title: true } },
    },
  });

  const valid = !!row && !row.revokedAt && new Date() <= row.expiresAt;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center px-5 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">HHI Builders</h1>
        <p className="text-sm text-zinc-500">Photo upload</p>
      </div>

      {!valid ? (
        <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-5 text-center">
          <p className="font-medium text-amber-900">This upload link isn’t active.</p>
          <p className="mt-1 text-sm text-amber-800">
            {row?.revokedAt
              ? "It has been turned off."
              : "It may have expired. Ask your HHI contact to generate a new QR code."}
          </p>
        </div>
      ) : (
        <PhoneUploader token={token} projectTitle={row!.project?.title ?? "your project"} />
      )}

      <p className="mt-auto pt-8 text-center text-xs text-zinc-400">
        Photos are added to your project for review. You can close this page when
        you’re done.
      </p>
    </main>
  );
}
