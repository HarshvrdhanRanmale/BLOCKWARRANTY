import { useCallback, useState } from "react";

const STORAGE_KEY = "blockwarranty_sidebar_open";

export function useSidebarPreference() {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setIsOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Keep the current-session toggle usable if storage is unavailable.
      }
      return next;
    });
  }, []);

  return { isOpen, toggle };
}
