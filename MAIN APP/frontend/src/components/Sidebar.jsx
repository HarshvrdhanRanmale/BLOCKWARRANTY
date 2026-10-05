import {
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Repeat2,
  UserRound,
  ChevronRight,
  ShieldCheck,
  LogOut,
} from "lucide-react";

import { NavLink, useNavigate } from "react-router-dom";
import { useAuthFlow } from "../auth/useAuthFlow";

function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  pinnedOpen = false,
  onHoverChange,
  pinnedMode = false,
  showBrand = false,
  topOffset = 76,
}) {
  const navigate = useNavigate();
  const { logout } = useAuthFlow();
  const menuItems = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },
    {
      name: "My Products",
      icon: Package,
      path: "/products",
    },
    {
      name: "Register Product",
      icon: Plus,
      path: "/register-product",
    },
    {
      name: "Verify Product",
      icon: Search,
      path: "/verify",
    },
    {
      name: "Transfer Ownership",
      icon: Repeat2,
      path: "/transfer",
    },
    {
      name: "Profile",
      icon: UserRound,
      path: "/profile",
    },
  ];

  const isExpanded = pinnedMode ? pinnedOpen || sidebarOpen : sidebarOpen;

  return (
    <aside
      onMouseEnter={(event) => {
        if (pinnedMode && event.target.closest("[data-sidebar-brand]")) return;
        if (pinnedMode) onHoverChange(true);
        else setSidebarOpen(true);
      }}
      onMouseLeave={() => {
        if (pinnedMode) onHoverChange(false);
        else setSidebarOpen(false);
      }}
      className={`
        group/sidebar
        fixed
        left-0
        ${topOffset === 0 ? "top-0 h-screen" : "top-[76px] h-[calc(100vh-76px)]"}
        bottom-0
        z-40
        overflow-hidden
        border-r
        border-[#E5E0DA]
        bg-[#F5F1EC]/95
        backdrop-blur-2xl
        shadow-[8px_0_35px_rgba(23,25,28,0.04)]
        transition-[width]
        duration-500
        ease-[cubic-bezier(0.22,1,0.36,1)]
        ${isExpanded ? "w-[280px]" : "w-[88px]"}
      `}
    >
      <div
        className="
          flex
          h-full
          w-full
          flex-col
          overflow-hidden
          px-4
          pt-6
          pb-5
        "
      >
        {showBrand && (
          <button
            type="button"
            data-sidebar-brand
            aria-label={`${pinnedOpen ? "Close" : "Open"} sidebar`}
            aria-expanded={isExpanded}
            title={pinnedOpen ? "Close sidebar" : "Open sidebar"}
            onMouseEnter={() => onHoverChange(false)}
            onClick={() => setSidebarOpen(!pinnedOpen)}
            className={`mb-5 flex h-16 w-full shrink-0 items-center rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
              isExpanded ? "justify-start gap-3" : "justify-center"
            }`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)]">
              <ShieldCheck size={25} strokeWidth={2.2} />
            </span>
            {isExpanded && (
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-lg font-extrabold tracking-tight text-[#0F172A]">
                  BlockWarranty
                </span>
                <span className="block whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.18em] text-[#64748B]">
                  Products. People. Protected.
                </span>
              </span>
            )}
          </button>
        )}

        {/* ================================
            NAVIGATION
        ================================= */}

        <nav className="flex flex-col gap-2">

          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `
                  group/item
                  relative
                  flex
                  h-12
                  w-full
                  shrink-0
                  items-center
                  ${isExpanded ? "justify-start" : "justify-center"}
                  overflow-hidden
                  rounded-2xl
                  transition-all
                  duration-300

                  ${
                    isActive
                      ? `
                        bg-[#8B1E3F]
                        text-white
                        shadow-[0_12px_30px_rgba(139,30,63,0.22)]
                      `
                      : `
                        text-[#6B7280]
                        hover:bg-[#F3DDE4]
                        hover:text-[#8B1E3F]
                      `
                  }
                `
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator */}

                    {isActive && (
                      <span
                        className="
                          absolute
                          left-0
                          top-1/2
                          h-8
                          w-1
                          -translate-y-1/2
                          rounded-r-full
                          bg-white
                        "
                      />
                    )}

                    {/* ICON */}

                    <span
                      className={`
                        flex
                        h-9
                        w-9
                        min-w-9
                        shrink-0
                        items-center
                        justify-center
                        text-current
                      `}
                    >
                      <Icon
                        size={20}
                        strokeWidth={1.9}
                      />
                    </span>

                    {/* TEXT */}

                    {isExpanded && (
                      <>
                        <span className="ml-4 whitespace-nowrap text-sm font-semibold">
                          {item.name}
                        </span>

                        <ChevronRight
                          size={16}
                          className={`ml-auto mr-2 min-w-4 shrink-0 transition-transform duration-300 group-hover/item:translate-x-1 ${
                            isActive
                              ? "text-white/80"
                              : "text-[#6B7280]/60"
                          }`}
                        />
                      </>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/");
            }}
            className={`
              group/item
              relative
              mt-2
              flex
              h-12
              w-full
              shrink-0
              items-center
              ${isExpanded ? "justify-start px-0" : "justify-center"}
              overflow-hidden
              rounded-2xl
              text-red-600
              transition-all
              duration-300
              hover:bg-red-50
            `}
          >
            <span className="flex h-9 w-9 min-w-9 shrink-0 items-center justify-center text-current">
              <LogOut size={20} strokeWidth={1.9} />
            </span>
            {isExpanded && (
              <span className="ml-4 whitespace-nowrap text-sm font-semibold">
                Logout
              </span>
            )}
          </button>
        </nav>

        {/* Push status to bottom */}

        <div className="flex-1" />

        {/* ================================
            BLOCKCHAIN STATUS
        ================================= */}

        <div
          className={`
            flex
            h-12
            min-h-12
            w-full
            items-center
            justify-center
            overflow-hidden
            rounded-2xl
            border
            border-[#E5E0DA]
            bg-[#F3DDE4]
            px-0
            py-0
            ${isExpanded ? "justify-start px-3" : "justify-center"}
          `}
        >
          <div className="flex items-center gap-3">

            <span
              className="
                h-2.5
                w-2.5
                min-w-2.5
                shrink-0
                rounded-full
                bg-[#16A34A]
                shadow-[0_0_12px_rgba(22,163,74,0.45)]
              "
            />

            <div
              className={`
                ${isExpanded ? "block" : "hidden"}
                whitespace-nowrap
              `}
            >
              <p className="text-xs font-semibold text-[#16A34A]">
                Blockchain connected
              </p>

              <p className="text-[10px] text-[#16A34A]/70">
                Network operational
              </p>
            </div>

          </div>
        </div>

      </div>
    </aside>
  );
}

export default Sidebar;