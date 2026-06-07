import { WorksheetPage } from "@/components/calculators/worksheet-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorksheetPage clientId={id} backHref={`/clients/${id}`} />;
}
