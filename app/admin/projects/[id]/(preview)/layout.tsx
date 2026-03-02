/**
 * Minimal layout for draft preview route only.
 * No admin header/nav — proposal content only (used in iframe).
 */
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {children}
    </div>
  );
}
