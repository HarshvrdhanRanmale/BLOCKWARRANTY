import { Check, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const progressSteps = ["Create wallet", "Connect", "Verify"];

export default function AuthShell({ children, step = 0, eyebrow, title, description }) {
  const activeStep = Math.max(0, Math.min(step, progressSteps.length - 1));

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
            Secure wallet setup
          </span>
        </header>

        <section className="flex flex-1 items-start justify-center pt-8 sm:items-center sm:py-10">
          <div className="w-full max-w-[640px]">
            <nav aria-label="Onboarding progress" className="mb-7">
              <ol className="flex items-center">
                {progressSteps.map((label, index) => {
                  const complete = index < activeStep;
                  const current = index === activeStep;
                  return (
                    <li key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            complete || current
                              ? "bg-[#2563EB] text-white"
                              : "bg-slate-200 text-[#64748B]"
                          }`}
                          aria-current={current ? "step" : undefined}
                        >
                          {complete ? <Check size={14} /> : index + 1}
                        </span>
                        <span className={`hidden text-xs font-semibold sm:inline ${current ? "text-[#0F172A]" : "text-[#64748B]"}`}>
                          {label}
                        </span>
                      </div>
                      {index < progressSteps.length - 1 && (
                        <span className={`mx-3 h-px min-w-5 flex-1 ${complete ? "bg-[#2563EB]" : "bg-slate-200"}`} />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

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
              Prototype only — mock wallet data. Never enter or share a real recovery phrase here.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
