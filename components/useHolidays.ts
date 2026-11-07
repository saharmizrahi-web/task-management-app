"use client";

import { useEffect, useMemo, useState } from "react";
import { HOLIDAY_META } from "@/lib/constants";
import type { Holiday } from "@/lib/types";

// Holidays don't change while the app is open: fetch once per page load, shared by every calendar.
let request: Promise<Holiday[]> | null = null;

function load(): Promise<Holiday[]> {
  request ??= fetch("/api/holidays")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { holidays: Holiday[] }) => j.holidays)
    .catch(() => {
      request = null; // try again on the next mount
      return [];
    });
  return request;
}

/** Holidays by date (YYYY-MM-DD), most important first. */
export function useHolidays(): Map<string, Holiday[]> {
  const [list, setList] = useState<Holiday[]>([]);

  useEffect(() => {
    let alive = true;
    load().then((h) => alive && setList(h));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of list) {
      if (!map.has(h.date)) map.set(h.date, []);
      map.get(h.date)!.push(h);
    }
    for (const l of map.values()) l.sort((a, b) => HOLIDAY_META[a.kind].rank - HOLIDAY_META[b.kind].rank);
    return map;
  }, [list]);
}
