import type { ReactNode } from "react";

/**
 * Shared semantic tone names for Vanara UI System v1.
 *
 * Use these names for operational state, summary counters, and compact facts.
 * Do not introduce page-specific color names such as roomReady or ticketUrgent;
 * map domain language to one of these shared tones before rendering.
 */
export type VanaraTone = "clean" | "progress" | "warning" | "critical" | "maintenance" | "neutral" | "closed";

/**
 * Stable children contract for shared Vanara layout primitives.
 *
 * Components should accept React children and generic accessibility props. Page
 * data belongs in page/read-model code, not in shared component prop names.
 */
export type VanaraChildren = ReactNode;
