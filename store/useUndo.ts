import { create } from "zustand";
import type { StrikeEventType } from "@/store/useStrikeStore";

/**
 * The quick-log event that can still be taken back. One at a time: logging a
 * second event replaces the first, which is what someone tapping twice in a
 * row expects — the undo button always refers to the last thing they did.
 */
type UndoState = {
  pending: { eventId: string; type: StrikeEventType; token: number } | null;
  offer: (eventId: string, type: StrikeEventType) => void;
  clear: () => void;
};

let nextToken = 1;

export const useUndo = create<UndoState>((set) => ({
  pending: null,
  offer: (eventId, type) => set({ pending: { eventId, type, token: nextToken++ } }),
  clear: () => set({ pending: null })
}));
