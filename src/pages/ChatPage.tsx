import { useNavigate, useParams } from "react-router-dom";
import TeamChatSurface from "../components/chat/TeamChatSurface";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  return (
    <WorkspaceShell title="Chat" workspace="chat" bodyClassName="chat-page">
      <TeamChatSurface
        activeConversationId={conversationId}
        mode="route"
        onActiveConversationChange={(nextConversationId) => navigate(`/chat/${nextConversationId}`)}
      />
    </WorkspaceShell>
  );
}
