import { Link } from "react-router-dom";
import WorkspaceShell from "../components/WorkspaceShell";
import { RoomIcon } from "../components/OperationsIcons";

export default function RoomsPage() {
  return (
    <WorkspaceShell title="Rooms" workspace="rooms">
      <section className="workspace-placeholder-card" aria-label="Rooms workspace">
        <RoomIcon />
        <h2>Room workspace</h2>
        <p>Open an existing room workspace while the full room list is prepared.</p>
        <Link to="/rooms/1">Open Room 01</Link>
      </section>
    </WorkspaceShell>
  );
}
