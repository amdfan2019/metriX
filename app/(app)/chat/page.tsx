import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChatPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask anything about your money — the agent uses your real budget state.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Slice 6</CardTitle>
          <CardDescription>
            Streaming Gemini chat with function calling: get_budget_status, can_i_afford,
            find_trends, and more.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
