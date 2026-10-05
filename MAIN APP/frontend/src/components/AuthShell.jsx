import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export default function AuthShell({ children, eyebrow, title, description }) {
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-5 text-[#0F172A] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-white shadow-sm">
              <ShieldCheck size={22} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight">BlockWarranty</span>
              <span className="block text-[9px] font-medium uppercase tracking-[0.2em] text-[#64748B]">
                Products. People. Protected.
              </span>
            </span>
          </Link>
          <span className="hidden items-center gap-2 text-xs font-medium text-[#64748B] sm:inline-flex">
            <ShieldCheck size={15} className="text-[#2563EB]" />
            Secure account access
          </span>
        </header>

        <section className="flex flex-1 items-start justify-center pt-8 sm:items-center sm:py-10">
          <div className="w-full max-w-[640px]">
            <div className="mb-5">
              {eyebrow && (
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2563EB]">
                  {eyebrow}
                </p>
              )}
              <h1 className="text-[28px] font-bold leading-tight tracking-[-0.035em] sm:text-[32px]">
                {title}
              </h1>
              {description && (
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#64748B] sm:text-[15px]">
                  {description}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.045)] sm:p-7">
              {children}
            </div>
            <p className="mt-4 text-center text-[11px] leading-5 text-[#94A3B8]">
              Protected by BlockWarranty and secured wallet infrastructure.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
