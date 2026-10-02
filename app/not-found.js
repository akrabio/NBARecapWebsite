import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="mb-2 text-2xl font-black">הדף לא נמצא</h1>
      <p className="mb-6 text-subtle">ייתכן שהקישור שגוי או שהסיכום הוסר.</p>
      <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-brand px-5 font-bold text-on-brand">
        לכל הסיכומים
      </Link>
    </main>
  );
}
