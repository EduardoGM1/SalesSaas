import { AnalysisPage } from "@/components/calculators/analysis-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalysisPage clientId={id} />;
}
