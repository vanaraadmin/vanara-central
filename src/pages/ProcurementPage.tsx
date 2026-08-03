import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadCurrentUser } from "../services/procurement.service";
import ProcurementOwnerPage from "./ProcurementOwnerPage";
import SupplyRequestPage from "./SupplyRequestPage";
import "../styles/ProcurementPage.css";

export default function ProcurementPage() {
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal) });
  if (user.isLoading) return <WorkspaceShell title="Procurement" workspace="procurement"><PageLoading /></WorkspaceShell>;
  if (user.isError || !user.data) return <WorkspaceShell title="Procurement" workspace="procurement"><PageError onRetry={() => void user.refetch()} /></WorkspaceShell>;
  return (
    <WorkspaceShell title="Procurement" workspace="procurement" bodyClassName="procurement-page">
      <SupplyRequestPage embedded />
      {user.data.isOwner ? <ProcurementOwnerPage embedded /> : null}
    </WorkspaceShell>
  );
}
