import { requestJson } from "./api.client";
import type { AvailabilityPricesResponse, AvailabilityPricesResult } from "../types/availability-prices";

export async function loadAvailabilityPrices(
  arrival: string,
  departure: string,
  signal?: AbortSignal,
): Promise<AvailabilityPricesResult> {
  const query = new URLSearchParams({ arrival, departure });
  const response = await requestJson<AvailabilityPricesResponse>(`/api/availability-prices?${query.toString()}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Prices are unavailable");
  return response.data;
}
