import { QuotationEditor } from '@/components/commercial/quotation-editor';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense>
      <QuotationEditor />
    </Suspense>
  );
}
