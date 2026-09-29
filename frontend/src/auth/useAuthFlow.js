import { useContext } from "react";
import { AuthFlowContext } from "./AuthFlowContext";

export function useAuthFlow() {
  const context = useContext(AuthFlowContext);
  if (!context) {
    throw new Error("useAuthFlow must be used within AuthFlowProvider.");
  }
  return context;
}
