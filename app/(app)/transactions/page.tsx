import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TransactionsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          The full transaction list with merchant resolution lives here.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Slice 3</CardTitle>
          <CardDescription>
            Connect a Basiq sandbox account to populate this view. Slice 4 adds the merchant
            resolver and the &ldquo;needs review&rdquo; queue.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
