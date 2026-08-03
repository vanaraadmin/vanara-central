import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import RoomCompactRow from "../components/rooms/RoomCompactRow";
import RoomExpandedWorkspace from "../components/rooms/RoomExpandedWorkspace";
import WorkspaceShell from "../components/WorkspaceShell";
import { useOutsidePointerDown } from "../hooks/useOutsidePointerDown";
import { completeHousekeepingTask, startHousekeepingTask, type HousekeepingTaskCompletionPayload } from "../services/housekeeping-v2.service";
import { createRoomOnDemandCleaning, startRoomStandardCleaning } from "../services/room-detail.service";
import { loadRoomsWorkspace } from "../services/rooms-workspace.service";
import "../styles/RoomsPage.css";
import type { RoomHousekeepingCompletionMode } from "../types/rooms-workspace";

function completionPayload(mode: RoomHousekeepingCompletionMode): HousekeepingTaskCompletionPayload {
  if (mode === "FULL") return { linenChangeCompleted: true };
  if (mode === "WATER") return { waterRefillCompleted: true };
  return { standardCleaningCompleted: true, linenChangeCompleted: false };
}

function roomActionKey(prefix: string, roomId: number): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `rooms:${prefix}:${roomId}:${nonce}`;
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4.75 11.1 12 5l7.25 6.1" />
      <path d="M6.75 10.2v8.05h10.5V10.2" />
      <path d="M10 18.25v-4.5h4v4.5" />
    </svg>
  );
}

export default function RoomsPage() {
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rooms = useQuery({
    queryKey: ["rooms", "workspace"],
    queryFn: ({ signal }) => loadRoomsWorkspace(signal),
  });
  const { isPending: roomActionPending, mutate: runRoomAction } = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms", "workspace"] });
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] });
    },
  });

  const roomList = rooms.data?.rooms ?? [];
  const expandedRoomStillVisible = expandedRoomId !== null && roomList.some((room) => room.unitId === expandedRoomId);
  const activeExpandedRoomId = expandedRoomStillVisible ? expandedRoomId : null;

  const collapse = useCallback(() => {
    setExpandedRoomId(null);
  }, []);

  const toggleRoom = useCallback((roomId: number) => {
    setExpandedRoomId((current) => (current === roomId ? null : roomId));
  }, []);

  const createOnDemandCleaning = useCallback((roomId: number) => {
    runRoomAction(() => createRoomOnDemandCleaning(String(roomId), {
      idempotencyKey: roomActionKey("on-demand-cleaning", roomId),
      priority: "normal",
    }));
  }, [runRoomAction]);

  const createStandardCleaning = useCallback((roomId: number) => {
    runRoomAction(() => startRoomStandardCleaning(String(roomId), roomActionKey("standard-cleaning", roomId)));
  }, [runRoomAction]);

  const startTask = useCallback((taskId: number, version: number) => {
    runRoomAction(() => startHousekeepingTask(taskId, version));
  }, [runRoomAction]);

  const completeTask = useCallback((taskId: number, version: number, mode: RoomHousekeepingCompletionMode) => {
    runRoomAction(() => completeHousekeepingTask(taskId, version, completionPayload(mode)));
  }, [runRoomAction]);

  useOutsidePointerDown(containerRef, collapse, activeExpandedRoomId !== null);

  useEffect(() => {
    if (expandedRoomId && !expandedRoomStillVisible) {
      const timer = window.setTimeout(() => {
        setExpandedRoomId(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [expandedRoomId, expandedRoomStillVisible]);

  useEffect(() => {
    if (!activeExpandedRoomId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedRoomId(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeExpandedRoomId]);

  const summaryItems = useMemo(() => {
    if (!rooms.data) return [];
    return [
      { label: "Occupied", value: rooms.data.summary.occupied },
      { label: "Vacant", value: rooms.data.summary.vacant },
      { label: "Maintenance", value: rooms.data.summary.maintenanceBlocked },
      { label: "Closed", value: rooms.data.summary.seasonClosed },
    ];
  }, [rooms.data]);

  return (
    <WorkspaceShell
      title="Rooms"
      workspace="rooms"
      bodyClassName="rooms-page"
      heroAction={(
        <button className="vc-secondary-glass-button" type="button" onClick={() => navigate("/staff")}>
          <HomeIcon />
          <span>Staff Home</span>
        </button>
      )}
    >
      {rooms.isLoading ? <PageLoading /> : null}
      {rooms.isError ? <PageError onRetry={() => void rooms.refetch()} /> : null}

      {rooms.data ? (
        <section className="rooms-home" aria-label="Rooms Home">
          <header className="rooms-home__summary vc-glass-surface" aria-label="Rooms operational summary">
            {summaryItems.map((item) => (
              <span className="rooms-summary-item" key={item.label}>
                <strong>{item.value}</strong>
                <small>{item.label}</small>
              </span>
            ))}
          </header>

          <div ref={containerRef} className="rooms-home__list vc-glass-surface">
            {roomList.map((room) => {
              const expanded = activeExpandedRoomId === room.unitId;
              const detailsId = `room-workspace-${room.unitId}`;

              return (
                <div className="rooms-home__item" key={room.unitId}>
                  <RoomCompactRow
                    expanded={expanded}
                    onToggle={() => toggleRoom(room.unitId)}
                    room={room}
                  />
                  {expanded ? (
                    <RoomExpandedWorkspace
                      actionPending={roomActionPending}
                      id={detailsId}
                      onCompleteHousekeepingTask={completeTask}
                      onCreateStandardCleaning={createStandardCleaning}
                      onCreateOnDemandCleaning={createOnDemandCleaning}
                      onStartHousekeepingTask={startTask}
                      room={room}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </WorkspaceShell>
  );
}
