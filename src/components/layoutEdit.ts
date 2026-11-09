import { create } from "zustand";

/** Whether the board is in freeform "Edit layout" mode. Not persisted. */
export const useLayoutEdit = create<{ editing: boolean; start: () => void; stop: () => void }>((set) => ({
  editing: false,
  start: () => set({ editing: true }),
  stop: () => set({ editing: false }),
}));
