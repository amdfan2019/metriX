import { resetAndCreateChatSession } from "@/lib/agent/messages";
import { ChatThread } from "./chat-thread";

export default async function ChatPage() {
  // Each /chat page load resets the user's chat history. Refresh = fresh.
  // Old sessions (and their messages) are deleted via FK cascade.
  await resetAndCreateChatSession();
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-6 h-[calc(100svh-2rem)]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask anything about your money — the agent reads your real budget state. Closing this
          page clears the conversation.
        </p>
      </header>
      <ChatThread initialMessages={[]} isDev={isDev} />
    </div>
  );
}
