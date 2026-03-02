import Link from "next/link";

export default function RootPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
        HHI Builders Proposal App
      </h1>
      <Link
        href="/admin"
        style={{
          display: "inline-block",
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          backgroundColor: "#0066cc",
          color: "white",
          textDecoration: "none",
          borderRadius: "4px",
          fontWeight: 500,
        }}
      >
        Go to Admin
      </Link>
    </main>
  );
}
