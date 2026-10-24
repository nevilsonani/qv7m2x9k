import { useCallback } from "react";
import { useSearchParams } from "react-router";

import type { GateId } from "../api/types";

// View state lives in the URL so any view can be shared or bookmarked
// ("look at 27 Jan with EPEX timing") and survives a refresh.

const GATES: readonly GateId[] = ["n2ex", "epex"];
export const DEFAULT_GATE: GateId = "n2ex";

export function useUrlParam(name: string, fallback: string): [string, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? fallback;
  const setValue = useCallback(
    (next: string | null) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === null || next === fallback) updated.delete(name);
          else updated.set(name, next);
          return updated;
        },
        { replace: true },
      ),
    [name, fallback, setParams],
  );
  return [value, setValue];
}

export function useFlag(name: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [raw, setRaw] = useUrlParam(name, fallback ? "1" : "0");
  const setFlag = useCallback((value: boolean) => setRaw(value ? "1" : "0"), [setRaw]);
  return [raw === "1", setFlag];
}

export function useGate(): [GateId, (gate: GateId) => void] {
  const [raw, setRaw] = useUrlParam("gate", DEFAULT_GATE);
  const gate = (GATES as readonly string[]).includes(raw) ? (raw as GateId) : DEFAULT_GATE;
  return [gate, setRaw];
}
