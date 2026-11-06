"use client";

import { useEffect, useRef } from "react";
import {
  equipmentChosenOnReturn,
  equipmentReturnPending,
} from "../equipment-return.js";

const tabStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * The return from « Définir mon matériel » (`equipment-return.js`): when the
 * page loads or its tab comes back to the front with a note waiting, it reads
 * the equipment again (`reload`, which answers the items of
 * `GET /api/equipment` and lays them in the page) and hands `onChosen` the
 * pieces that become a field's value (`{ telescope: "id", … }`, one per type
 * where exactly one is new). A failed read keeps the note for the next time.
 */
export function useEquipmentReturn({ reload, onChosen, enabled = true }) {
  const latest = useRef({ reload, onChosen });
  latest.current = { reload, onChosen };
  useEffect(() => {
    if (!enabled) return undefined;
    let reading = false;
    let gone = false;
    const check = async () => {
      const storage = tabStorage();
      if (reading || !equipmentReturnPending(storage)) return;
      reading = true;
      try {
        const items = await latest.current.reload();
        if (gone) return;
        const chosen = equipmentChosenOnReturn(storage, items);
        if (Object.keys(chosen).length) latest.current.onChosen?.(chosen);
      } catch {
        // The note stays: the next return to the tab reads again.
      } finally {
        reading = false;
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      gone = true;
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
}
