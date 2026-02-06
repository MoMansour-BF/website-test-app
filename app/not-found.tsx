import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-4xl font-semibold text-slate-300">404</p>
      <p className="mt-2 text-slate-400">This page could not be found.</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        Go to home
      </Link>
      <p className="mt-4 text-xs text-slate-500">
        Use the root URL (e.g. <strong>http://localhost:3002/</strong>).
      </p>
    </main>
  );
}
