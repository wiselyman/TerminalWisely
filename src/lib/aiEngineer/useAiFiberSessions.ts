import { useSyncExternalStore } from "react";
import {
  getAiFiberEpoch,
  listAiFiberSessions,
  subscribeAiFibers,
} from "../../stores/hostWorkspaceMemory";

/** Reactive list of SSH sessions that keep an AI panel fiber mounted. */
export function useAiFiberSessions(): string[] {
  const epoch = useSyncExternalStore(
    subscribeAiFibers,
    getAiFiberEpoch,
    getAiFiberEpoch,
  );
  void epoch;
  return listAiFiberSessions();
}
