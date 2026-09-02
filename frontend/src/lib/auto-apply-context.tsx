"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AutoApplyContextValue = {
  enabled: boolean;
  allowed: boolean;
  requestUpgrade: () => void;
};

const AutoApplyContext = createContext<AutoApplyContextValue>({
  enabled: false,
  allowed: false,
  requestUpgrade: () => {},
});

export function AutoApplyProvider({
  value,
  children,
}: {
  value: AutoApplyContextValue;
  children: ReactNode;
}) {
  return (
    <AutoApplyContext.Provider value={value}>
      {children}
    </AutoApplyContext.Provider>
  );
}

export function useAutoApply() {
  return useContext(AutoApplyContext);
}

export function useAutoApplyEnabled() {
  return useContext(AutoApplyContext).enabled;
}
