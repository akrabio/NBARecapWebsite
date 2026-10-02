export default function Footer() {
  return (
    <footer className="mx-auto mt-6 flex max-w-3xl flex-col items-center gap-3 px-4 pt-6 pb-[calc(32px+env(safe-area-inset-bottom))] text-center">
      <a
        href="https://x.com/NRecaps84077"
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 items-center gap-2 rounded-xl border bg-surface px-4 text-sm font-semibold text-body"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        עקבו אחרינו ב-X
      </a>
      <p className="text-xs text-faint">© {new Date().getFullYear()} סיכומי NBA בעברית</p>
    </footer>
  );
}
