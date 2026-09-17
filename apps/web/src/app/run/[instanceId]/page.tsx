import { Runner } from "@/features/runner/Runner";

export default async function RunPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  return <Runner instanceId={instanceId} />;
}
