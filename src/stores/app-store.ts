import { create } from "zustand";

export type RouteId =
  | "dashboard"
  | "jobs"
  | "prospecting"
  | "outreach"
  | "applications"
  | "analytics"
  | "profile"
  | "settings";

type AppStore = {
  route: RouteId;
  setRoute: (route: RouteId) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  route: "dashboard",
  setRoute: (route) => set({ route }),
}));
