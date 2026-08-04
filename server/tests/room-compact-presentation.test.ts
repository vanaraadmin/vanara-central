import assert from "node:assert/strict";
import test from "node:test";

import { getRoomCompactPresentation, type RoomCompactPresentation } from "../../src/config/roomOperationalPresentation.ts";
import type { RoomsWorkspaceRoom } from "../../src/types/rooms-workspace.ts";

type RoomOverrides = Partial<RoomsWorkspaceRoom> & {
  operational?: Partial<RoomsWorkspaceRoom["operational"]> & {
    availability?: Partial<RoomsWorkspaceRoom["operational"]["availability"]>;
    occupancy?: Partial<RoomsWorkspaceRoom["operational"]["occupancy"]>;
    housekeeping?: Partial<RoomsWorkspaceRoom["operational"]["housekeeping"]>;
    maintenance?: Partial<RoomsWorkspaceRoom["operational"]["maintenance"]>;
  };
  reception?: Partial<RoomsWorkspaceRoom["reception"]> & {
    today?: Partial<RoomsWorkspaceRoom["reception"]["today"]>;
  };
};

function room(overrides: RoomOverrides = {}): RoomsWorkspaceRoom {
  const base: RoomsWorkspaceRoom = {
    unitId: 1,
    roomName: "Bungalow 2",
    roomType: "Bungalow",
    accommodationType: "Bungalow",
    sortGroup: "bungalow",
    sortNumber: 2,
    heroImageKey: "bungalow-2",
    alertSummary: null,
    currentStay: null,
    operational: {
      availability: {
        state: "OPERATING",
        reason: null,
        startDate: null,
        endDate: null,
        seasonLabel: null,
      },
      occupancy: {
        state: "VACANT",
        guestName: null,
        bookingId: null,
        source: null,
      },
      housekeeping: {
        condition: "READY",
        workState: "NONE",
        activeTaskType: null,
        assignedTo: null,
      },
      maintenance: {
        state: "CLEAR",
        activeTicketCount: 0,
        blockingTicketCount: 0,
        primaryTitle: null,
      },
    },
    reception: {
      phase: "NONE",
      today: {
        checkIn: false,
        checkOut: false,
      },
      passport: {
        state: "NOT_REQUIRED",
        completedAt: null,
      },
      deposit: {
        state: "NOT_REQUIRED",
        completedAt: null,
      },
      checkIn: {
        state: "NOT_REQUIRED",
        completedAt: null,
      },
      checkOut: {
        state: "NOT_REQUIRED",
        completedAt: null,
      },
      alerts: [],
      primaryAction: null,
    },
    housekeeping: {
      primaryStatus: "CLEAN",
      tone: "success",
      detail: "No work required",
      secondaryInfo: null,
      activeTask: null,
      primaryAction: null,
    },
    maintenance: {
      primaryStatus: "No Issues",
      tone: "success",
      detail: "No technical issue.",
      secondaryInfo: null,
      primaryAction: null,
    },
  };

  return {
    ...base,
    ...overrides,
    operational: {
      ...base.operational,
      ...overrides.operational,
      availability: {
        ...base.operational.availability,
        ...overrides.operational?.availability,
      },
      occupancy: {
        ...base.operational.occupancy,
        ...overrides.operational?.occupancy,
      },
      housekeeping: {
        ...base.operational.housekeeping,
        ...overrides.operational?.housekeeping,
      },
      maintenance: {
        ...base.operational.maintenance,
        ...overrides.operational?.maintenance,
      },
    },
    reception: {
      ...base.reception,
      ...overrides.reception,
      today: {
        ...base.reception.today,
        ...overrides.reception?.today,
      },
      alerts: overrides.reception?.alerts ?? base.reception.alerts,
    },
  };
}

function labels(presentation: RoomCompactPresentation): string[] {
  return [
    presentation.primary.label,
    presentation.occupancy?.label ?? null,
    presentation.housekeeping?.label ?? null,
    ...presentation.secondarySignals.map((signal) => signal.label),
  ].filter((item): item is string => item !== null);
}

test("maintenance-blocked room returns terminal mode with no occupancy or housekeeping signal", () => {
  const presentation = getRoomCompactPresentation(room({
    roomName: "Bungalow 7",
    operational: {
      maintenance: {
        state: "BLOCKING",
        activeTicketCount: 1,
        blockingTicketCount: 1,
        primaryTitle: "Replace Air Conditioning",
      },
      occupancy: {
        state: "VACANT",
      },
      housekeeping: {
        condition: "READY",
      },
    },
  }));

  assert.equal(presentation.mode, "MAINTENANCE_BLOCKED");
  assert.equal(presentation.primary.label, "OUT OF SERVICE");
  assert.equal(presentation.primary.detail, "Replace Air Conditioning");
  assert.equal(presentation.occupancy, null);
  assert.equal(presentation.housekeeping, null);
  assert.deepEqual(presentation.secondarySignals, []);
  assert.equal(labels(presentation).includes("VACANT"), false);
  assert.equal(labels(presentation).includes("CLEAN"), false);
});

test("season-closed room returns terminal mode with no occupancy or housekeeping signal", () => {
  const presentation = getRoomCompactPresentation(room({
    roomName: "Tent 1",
    accommodationType: "Tent",
    operational: {
      availability: {
        state: "NOT_OPERATING",
        reason: "Season Closed",
        endDate: "11-20",
      },
      occupancy: {
        state: "OCCUPIED",
        guestName: "Hidden Guest",
      },
      housekeeping: {
        condition: "NOT_READY",
      },
    },
  }));

  assert.equal(presentation.mode, "SEASON_CLOSED");
  assert.equal(presentation.primary.label, "SEASON CLOSED");
  assert.equal(presentation.primary.detail, "Until 20 Nov");
  assert.equal(presentation.occupancy, null);
  assert.equal(presentation.housekeeping, null);
  assert.equal(labels(presentation).includes("OCCUPIED"), false);
  assert.equal(labels(presentation).includes("DIRTY"), false);
});

test("operating occupied clean room returns OCCUPIED then CLEAN", () => {
  const presentation = getRoomCompactPresentation(room({
    roomName: "Villa 10",
    roomType: "Villa",
    accommodationType: "Villa",
    operational: {
      occupancy: {
        state: "OCCUPIED",
        guestName: "Ciccio Graziani",
      },
    },
  }));

  assert.equal(presentation.mode, "STANDARD");
  assert.equal(presentation.primary.detail, "Ciccio Graziani");
  assert.equal(presentation.occupancy?.label, "OCCUPIED");
  assert.equal(presentation.housekeeping?.label, "CLEAN");
});

test("operating vacant clean room returns VACANT then CLEAN", () => {
  const presentation = getRoomCompactPresentation(room());

  assert.equal(presentation.occupancy?.label, "VACANT");
  assert.equal(presentation.housekeeping?.label, "CLEAN");
});

test("dirty room returns only DIRTY for housekeeping", () => {
  const presentation = getRoomCompactPresentation(room({
    operational: {
      housekeeping: {
        condition: "NOT_READY",
      },
    },
  }));

  assert.equal(presentation.housekeeping?.label, "DIRTY");
  assert.equal(labels(presentation).includes("CLEAN"), false);
  assert.equal(labels(presentation).includes("CLEANING IN PROGRESS"), false);
});

test("in-progress cleaning overrides dirty and clean", () => {
  const presentation = getRoomCompactPresentation(room({
    operational: {
      housekeeping: {
        condition: "NOT_READY",
        workState: "IN_PROGRESS",
        activeTaskType: "Cleaning",
      },
    },
  }));

  assert.equal(presentation.housekeeping?.label, "CLEANING IN PROGRESS");
  assert.equal(labels(presentation).includes("DIRTY"), false);
  assert.equal(labels(presentation).includes("CLEAN"), false);
});

test("non-blocking maintenance appears only as secondary signal", () => {
  const presentation = getRoomCompactPresentation(room({
    operational: {
      maintenance: {
        state: "ACTIVE",
        activeTicketCount: 1,
        primaryTitle: "Fix bathroom light",
      },
    },
  }));

  assert.equal(presentation.mode, "STANDARD");
  assert.equal(presentation.secondarySignals[0]?.label, "MAINTENANCE");
  assert.equal(presentation.primary.label, "Bungalow 2");
});

test("blocking maintenance never appears as non-blocking maintenance", () => {
  const presentation = getRoomCompactPresentation(room({
    operational: {
      maintenance: {
        state: "BLOCKING",
        activeTicketCount: 1,
        blockingTicketCount: 1,
      },
    },
  }));

  assert.equal(presentation.mode, "MAINTENANCE_BLOCKED");
  assert.equal(presentation.secondarySignals.some((signal) => signal.label === "MAINTENANCE"), false);
});

test("check-in and check-out today appear after maintenance", () => {
  const checkIn = getRoomCompactPresentation(room({
    operational: {
      maintenance: {
        state: "ACTIVE",
        activeTicketCount: 1,
      },
    },
    reception: {
      today: {
        checkIn: true,
      },
    },
  }));
  const checkOut = getRoomCompactPresentation(room({
    operational: {
      maintenance: {
        state: "ACTIVE",
        activeTicketCount: 1,
      },
    },
    reception: {
      today: {
        checkOut: true,
      },
    },
  }));

  assert.deepEqual(checkIn.secondarySignals.map((signal) => signal.label), ["MAINTENANCE", "CHECK-IN TODAY"]);
  assert.deepEqual(checkOut.secondarySignals.map((signal) => signal.label), ["MAINTENANCE", "CHECK-OUT TODAY"]);
});

test("same-day arrival and departure map to one TURNOVER TODAY signal", () => {
  const presentation = getRoomCompactPresentation(room({
    reception: {
      today: {
        checkIn: true,
        checkOut: true,
      },
    },
  }));

  assert.deepEqual(presentation.secondarySignals.map((signal) => signal.label), ["TURNOVER TODAY"]);
});

test("passport and deposit alerts map to final compact reception signals", () => {
  const passport = getRoomCompactPresentation(room({
    reception: {
      alerts: [{ id: 1, type: "passport_missing", label: "Passport Missing", tone: "warning" }],
    },
  }));
  const deposit = getRoomCompactPresentation(room({
    reception: {
      alerts: [{ id: 2, type: "deposit_pending", label: "Deposit Pending", tone: "warning" }],
    },
  }));
  const combined = getRoomCompactPresentation(room({
    reception: {
      alerts: [
        { id: 1, type: "passport_missing", label: "Passport Missing", tone: "warning" },
        { id: 2, type: "deposit_pending", label: "Deposit Pending", tone: "warning" },
      ],
    },
  }));

  assert.deepEqual(passport.secondarySignals.map((signal) => signal.label), ["PASSPORT MISSING"]);
  assert.deepEqual(deposit.secondarySignals.map((signal) => signal.label), ["DEPOSIT PENDING"]);
  assert.deepEqual(combined.secondarySignals.map((signal) => signal.label), ["RECEPTION ATTENTION"]);
});

test("secondary signals preserve every operational alert for wrapping rows", () => {
  const presentation = getRoomCompactPresentation(room({
    operational: {
      maintenance: {
        state: "ACTIVE",
        activeTicketCount: 1,
      },
    },
    reception: {
      today: {
        checkOut: true,
      },
      alerts: [{ id: 1, type: "passport_missing", label: "Passport Missing", tone: "warning" }],
    },
  }));

  assert.equal(presentation.secondarySignals.length, 3);
  assert.deepEqual(presentation.secondarySignals.map((signal) => signal.label), ["MAINTENANCE", "CHECK-OUT TODAY", "PASSPORT MISSING"]);
});

test("accessible summary includes every displayed operational fact", () => {
  const presentation = getRoomCompactPresentation(room({
    roomName: "Bungalow 6",
    operational: {
      occupancy: {
        state: "OCCUPIED",
        guestName: "Mali Guest",
      },
      maintenance: {
        state: "ACTIVE",
        activeTicketCount: 1,
      },
    },
    reception: {
      today: {
        checkOut: true,
      },
    },
  }));

  for (const fact of ["Bungalow 6", "Bungalow", "OCCUPIED", "CLEAN", "MAINTENANCE", "CHECK-OUT TODAY"]) {
    assert.match(presentation.accessibleSummary, new RegExp(fact));
  }
});

test("no raw backend enum appears in compact UI copy", () => {
  const presentation = getRoomCompactPresentation(room({
    operational: {
      housekeeping: {
        condition: "NOT_READY",
        workState: "AVAILABLE",
        activeTaskType: "Cleaning",
      },
    },
    reception: {
      today: {
        checkIn: true,
      },
    },
  }));
  const copy = [
    presentation.primary.label,
    presentation.primary.detail,
    presentation.occupancy?.label,
    presentation.housekeeping?.label,
    presentation.accessibleSummary,
    ...presentation.secondarySignals.map((signal) => signal.label),
  ].filter(Boolean).join(" ");

  for (const raw of ["READY", "NOT_READY", "AVAILABLE_FOR_CLAIM", "STANDARD_CLEANING", "NOT_OPERATING"]) {
    assert.doesNotMatch(copy, new RegExp(raw));
  }
});
