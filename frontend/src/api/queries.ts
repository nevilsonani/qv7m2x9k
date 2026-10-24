import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query";

import { getJson } from "./client";
import type { Accuracy, Basis, CalendarDay, DecisionView, GateId, Insight, LeadTimeCurve, Meta, Variant } from "./types";

// The pilot data is a fixed historical window, so nothing ever goes stale.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: ({ signal }) => getJson<Meta>("/api/meta", undefined, signal),
  });
}

export function useDecision(decisionDate: string | undefined, gate: GateId) {
  return useQuery({
    queryKey: ["decision", decisionDate, gate],
    queryFn: ({ signal }) => getJson<DecisionView>(`/api/decisions/${decisionDate}`, { gate }, signal),
    enabled: Boolean(decisionDate),
    placeholderData: keepPreviousData,
  });
}

export function useCalendar(gate: GateId) {
  return useQuery({
    queryKey: ["calendar", gate],
    queryFn: ({ signal }) => getJson<CalendarDay[]>("/api/calendar", { gate }, signal),
    placeholderData: keepPreviousData,
  });
}

export interface AccuracyParams {
  basis: Basis;
  gate: GateId;
  horizonH: number;
  variant: Variant;
  start?: string;
  end?: string;
}

export function accuracyQueryParams(p: AccuracyParams) {
  return {
    basis: p.basis,
    gate: p.gate,
    horizon_h: p.horizonH,
    variant: p.basis === "horizon" ? "raw" : p.variant,
    start: p.start,
    end: p.end,
  };
}

export function useAccuracy(params: AccuracyParams) {
  const query = accuracyQueryParams(params);
  return useQuery({
    queryKey: ["accuracy", query],
    queryFn: ({ signal }) => getJson<Accuracy>("/api/accuracy", query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useLeadTimeCurve(gate: GateId, start?: string, end?: string) {
  return useQuery({
    queryKey: ["lead-time-curve", gate, start, end],
    queryFn: ({ signal }) => getJson<LeadTimeCurve>("/api/lead-time-curve", { gate, start, end }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useInsights(gate: GateId) {
  return useQuery({
    queryKey: ["insights", gate],
    queryFn: ({ signal }) => getJson<Insight[]>("/api/insights", { gate }, signal),
    placeholderData: keepPreviousData,
  });
}
