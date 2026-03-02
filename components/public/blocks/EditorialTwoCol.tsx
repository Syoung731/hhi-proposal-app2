"use client";

type EditorialTwoColProps = {
  /** Left column (often heading + text) */
  left: React.ReactNode;
  /** Right column (often image or supporting content) */
  right: React.ReactNode;
  /** Reverse order on mobile (right content first) */
  reverseOnMobile?: boolean;
  /** Optional class for the grid container */
  className?: string;
};

export function EditorialTwoCol({
  left,
  right,
  reverseOnMobile = false,
  className = "",
}: EditorialTwoColProps) {
  return (
    <div
      className={`grid gap-10 sm:gap-14 md:grid-cols-2 md:items-start md:gap-16 ${className}`}
    >
      <div className={`min-w-0 ${reverseOnMobile ? "order-2 md:order-1" : ""}`}>
        <div className="max-w-xl">{left}</div>
      </div>
      <div className={`min-w-0 ${reverseOnMobile ? "order-1 md:order-2" : ""}`}>
        {right}
      </div>
    </div>
  );
}
