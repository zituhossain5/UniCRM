'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { caseLabel, type CustomerCase } from '@/lib/case-types';
import { Badge, Button, EmptyState } from '@unicrm/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CaseCreateSheet } from './case-create-sheet';

export function RelatedCases({
  entityId,
  entityType,
  companyId,
}: {
  entityId: string;
  entityType: 'contact' | 'company' | 'lead' | 'deal';
  companyId?: string | null;
}) {
  const current = useCurrentUser();
  const [records, setRecords] = useState<CustomerCase[]>([]);
  const [open, setOpen] = useState(false);
  const load = () =>
    apiRequest<{ data: CustomerCase[] }>(`/cases?${entityType}=${entityId}&limit=20`)
      .then((result) => setRecords(result.data))
      .catch(() => undefined);
  useEffect(() => {
    if (current.permissions.includes('case.read')) void load();
  }, [current.permissions, entityId, entityType]);
  if (!current.permissions.includes('case.read')) return null;
  const initial = { [`${entityType}Id`]: entityId, ...(companyId ? { companyId } : {}) };
  return (
    <section className="record-section record-section--wide">
      <div className="section-heading">
        <h2>Cases</h2>
        {current.permissions.includes('case.create') ? (
          <CaseCreateSheet
            open={open}
            onOpenChange={setOpen}
            onCreated={() => void load()}
            initial={initial}
            trigger={
              <Button variant="outline">
                <Plus size={14} />
                New case
              </Button>
            }
          />
        ) : null}
      </div>
      {!records.length ? (
        <EmptyState
          title="No related cases"
          description="Customer support cases linked to this record appear here."
        />
      ) : (
        <div className="case-feed">
          {records.map((record) => (
            <article key={record.id}>
              <Link href={`/app/cases/${record.id}`}>
                <strong>{record.caseNumber}</strong> · {record.title}
              </Link>
              <Badge>{caseLabel(record.status)}</Badge>
              <small>
                {record.assignedUser
                  ? `${record.assignedUser.firstName} ${record.assignedUser.lastName}`
                  : 'Unassigned'}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
