import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import RoomCompactRow from "../components/rooms/RoomCompactRow";
import RoomExpandedWorkspace from "../components/rooms/RoomExpandedWorkspace";
import WorkspaceShell from "../components/WorkspaceShell";
import { useOutsidePointerDown } from "../hooks/useOutsidePointerDown";
import { loadRoomsWorkspace } from "../services/rooms-workspace.service";
import "../styles/RoomsPage.css";

export default function RoomsPage() {
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rooms = useQuery({
    queryKey: ["rooms", "workspace"],
    queryFn: ({ signal }) => loadRoomsWorkspace(signal),
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
    const { occupied, total } = rooms.data.summary;
    return `${occupied}/${total} occupied`;
  }, [rooms.data]);

  return (
    <WorkspaceShell title="Rooms" workspace="rooms" bodyClassName="rooms-page">
      {rooms.isLoading ? <PageLoading /> : null}
      {rooms.isError ? <PageError onRetry={() => void rooms.refetch()} /> : null}

      {rooms.data ? (
        <section className="rooms-home" aria-label="Rooms Home">
          <header className="rooms-home__summary">
            <span>{summaryText}</span>
            <span>{rooms.data.summary.notReady} not ready</span>
            <span>{rooms.data.summary.maintenance} maintenance</span>
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
                  {expanded ? <RoomExpandedWorkspace id={detailsId} room={room} /> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </WorkspaceShell>
  );
}
