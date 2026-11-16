import { useCallback, useEffect, useState } from "react";

/**
 * The active creator channel, shared across the Channels, Audience, and
 * Operations pages. Per-viewer convenience only, so it lives in localStorage and
 * degrades to in-memory state when storage is unavailable.
 */
const KEY = "cutroom.activeChannelId";
const EVENT = "cutroom:active-channel";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useActiveChannel() {
  const [activeChannelId, setState] = useState<string | null>(() => read());

  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setActiveChannelId = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // ignore storage failures; state still updates in-memory
    }
    setState(id);
    try {
      window.dispatchEvent(new Event(EVENT));
    } catch {
      // ignore
    }
  }, []);

  return { activeChannelId, setActiveChannelId };
}
