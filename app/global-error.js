"use client";

// Last-resort error page, used when the root layout itself fails. It replaces
// the layout, so it brings its own <html> and plain styles.
export default function GlobalError({ reset }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f6f8", color: "#11141a" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 8 }}>משהו השתבש</h1>
            <p style={{ color: "#5f6779", marginBottom: 24 }}>לא הצלחנו לטעון את האתר. נסו שוב בעוד רגע.</p>
            <button
              onClick={() => reset()}
              style={{ height: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#c2410c", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
            >
              נסו שוב
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
