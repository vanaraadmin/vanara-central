import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function RoomsPage() {
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const summaryText = useMemo(() => {
    if (!rooms.data) return null;
    return `${rooms.data.summary.occupied} occupied`;
  }, [rooms.data]);

  return (
    <WorkspaceShell title="Rooms" workspace="rooms" bodyClassName="rooms-page">
      {rooms.isLoading ? <PageLoading /> : null}
      {rooms.isError ? <PageError onRetry={() => void rooms.refetch()} /> : null}

      {rooms.data ? (
        <section className="rooms-home" aria-label="Rooms Home">
          <header className="rooms-home__summary">
            <span>{summaryText}</span>
            <span>{rooms.data.summary.vacant} vacant</span>
            <span>{rooms.data.summary.maintenanceBlocked} maintenance blocked</span>
            <span>{rooms.data.summary.seasonClosed} season closed</span>
          </header>

          <div ref={containerRef} className="rooms-home__list">
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
