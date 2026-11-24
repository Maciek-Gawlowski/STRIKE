import { create } from "zustand";
import type { ZoneProximity } from "@/services/protectionZones";
import type { ProtectionZone } from "@/services/protectionZones";

/**
 * Where the angler is relative to the fredningsbælter closed today, as last
 * worked out by ZoneWatcher. Screens read this to show a banner; only the
 * watcher writes it.
 */
type ZoneStatusState = {
  inside: ProtectionZone[];
  near: ZoneProximity | null;
  set: (inside: ProtectionZone[], near: ZoneProximity | null) => void;
  clear: () => void;
};

export const useZoneStatus = create<ZoneStatusState>((set) => ({
  inside: [],
  near: null,
  set: (inside, near) => set({ inside, near }),
  clear: () => set({ inside: [], near: null })
}));
