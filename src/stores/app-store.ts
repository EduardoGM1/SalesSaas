import { create } from "zustand";

export type ToolMode = "libre" | "client";

interface AppState {
  hydrated: boolean;
  calYear: number;
  calMonth: number;
  selDay: number | null;
  sidebarOpen: boolean;
  toolMode: ToolMode;
  activeClientId: string | null;
  setHydrated: (v: boolean) => void;
  setCalMonth: (year: number, month: number) => void;
  calPrev: () => void;
  calNext: () => void;
  setSelDay: (day: number | null) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setToolMode: (mode: ToolMode, clientId?: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  hydrated: false,
  calYear: 2000,
  calMonth: 0,
  selDay: null,
  sidebarOpen: false,
  toolMode: "libre",
  activeClientId: null,
  setHydrated: (v) => set({ hydrated: v }),
  setCalMonth: (year, month) => set({ calYear: year, calMonth: month, selDay: null }),
  calPrev: () =>
    set((s) => {
      let m = s.calMonth - 1;
      let y = s.calYear;
      if (m < 0) { m = 11; y--; }
      return { calMonth: m, calYear: y, selDay: null };
    }),
  calNext: () =>
    set((s) => {
      let m = s.calMonth + 1;
      let y = s.calYear;
      if (m > 11) { m = 0; y++; }
      return { calMonth: m, calYear: y, selDay: null };
    }),
  setSelDay: (day) => set({ selDay: day }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  setToolMode: (mode, clientId = null) =>
    set({ toolMode: mode, activeClientId: clientId }),
}));
