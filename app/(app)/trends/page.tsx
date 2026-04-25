import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TrendsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>
        <p className="text-sm text-muted-foreground">Last 6 months of spend, by category.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Slice 8</CardTitle>
          <CardDescription>Recharts visualisations. Needs categorised history first.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
