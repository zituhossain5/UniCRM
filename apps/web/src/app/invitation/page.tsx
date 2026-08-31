import { InvitationForm } from '@/components/invitation-form';

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <InvitationForm token={token} />;
}
