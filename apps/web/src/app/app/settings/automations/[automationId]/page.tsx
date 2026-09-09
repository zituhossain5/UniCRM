import { AutomationsSettings } from '@/components/settings/automations-settings';

export default async function AutomationEditorPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;
  return <AutomationsSettings automationId={automationId} view="editor" />;
}
