import { requestJson } from "./api.client";
import type { ArrivalsDeparturesAgenda, ArrivalsDeparturesResponse } from "../types/movements";

export async function loadArrivalsDepartures(signal?: AbortSignal): Promise<ArrivalsDeparturesAgenda> {
  const response = await requestJson<ArrivalsDeparturesResponse>("/api/movements", signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Arrivals and departures are unavailable");
  }

  return response.data;
}