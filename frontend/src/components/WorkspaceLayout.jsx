import { useState } from "react";
import Sidebar from "./Sidebar";

function WorkspaceLayout({ children }) {
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinnedOpen || sidebarHovered;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <Sidebar
        sidebarOpen={sidebarHovered}
        setSidebarOpen={setSidebarPinnedOpen}
        pinnedOpen={sidebarPinnedOpen}
        onHoverChange={setSidebarHovered}
        pinnedMode
        showBrand
        topOffset={0}
      />
      <main
        className={`min-h-screen min-w-0 transition-[margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarOpen ? "ml-[280px]" : "ml-[88px]"
        }`}
      >
        <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}

export default WorkspaceLayout;
