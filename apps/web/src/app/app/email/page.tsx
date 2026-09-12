import { MailboxInbox } from '@/components/mail/mailbox-inbox';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  return <MailboxInbox initialThreadId={thread ?? null} />;
}
