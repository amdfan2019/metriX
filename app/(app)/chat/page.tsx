import { fetchSessionMessages, getOrCreateLatestSession } from "@/lib/agent/messages";
import { ChatThread } from "./chat-thread";

export default async function ChatPage() {
  const sessionId = await getOrCreateLatestSession();
  const messages = await fetchSessionMessages(sessionId);
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-6 h-[calc(100svh-2rem)]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask anything about your money — the agent reads your real budget state.
        </p>
      </header>
      <ChatThread initialMessages={messages} isDev={isDev} />
    </div>
  );
}
