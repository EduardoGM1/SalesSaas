import { VacacionesPage } from "@/components/calculators/vacaciones-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VacacionesPage clientId={id} backHref={`/clients/${id}`} />;
}
