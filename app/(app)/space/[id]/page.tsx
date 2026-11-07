import { SpacePage } from "@/components/SpacePage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SpacePage spaceId={Number(id)} />;
}
