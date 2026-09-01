import { ContactDetail } from '@/components/crm/contact-detail';
export default async function Page({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return <ContactDetail id={contactId} />;
}
