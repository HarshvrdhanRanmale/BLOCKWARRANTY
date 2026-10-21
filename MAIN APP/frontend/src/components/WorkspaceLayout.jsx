import { Menu, ShieldCheck } from "lucide-react";
import Sidebar from "./Sidebar";
import { useSidebarPreference } from "./useSidebarPreference";
import IncomingTransferNotification from "./IncomingTransferNotification";

function WorkspaceLayout({ children }) {
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebarPreference();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity md:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile Top App Bar */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-100"
          >
            <Menu size={18} />
          </button>
          <span className="flex items-center gap-2 font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ShieldCheck size={16} />
            </span>
            <span className="text-sm">BlockWarranty</span>
          </span>
        </div>
      </header>

      <Sidebar
        sidebarOpen={sidebarOpen}
        onToggle={toggleSidebar}
        showBrand
        topOffset={0}
      />

      <main
        className={`min-h-screen min-w-0 transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarOpen ? "md:ml-[280px]" : "md:ml-[88px]"
        } ml-0`}
      >
        <div className="mx-auto max-w-[1600px] px-3.5 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>

      <IncomingTransferNotification />
    </div>
  );
}

export default WorkspaceLayout;
