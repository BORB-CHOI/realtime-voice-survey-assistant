import VoiceSurveyClient from "@/app/(survey)/_components/VoiceSurveyClient";

type PageProps = {
  params: { model: string };
};

export default function Page({ params }: PageProps) {
  return <VoiceSurveyClient model={decodeURIComponent(params.model)} />;
}
