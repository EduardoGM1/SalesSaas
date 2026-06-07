import { SurveyPage } from "@/components/calculators/survey-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SurveyPage clientId={id} backHref={`/clients/${id}`} />;
}
