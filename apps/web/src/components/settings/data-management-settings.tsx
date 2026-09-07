'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  DataExportEntityType,
  DataJobsResponse,
  DataImportEntityType,
  DuplicateEntityType,
  DuplicateGroup,
  ExportResult,
  ImportPreview,
} from '@/lib/data-management-types';
import { Button, LoadingState, Select, Textarea } from '@unicrm/ui';
import { Download, Search, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

const importEntities: DataImportEntityType[] = ['COMPANY', 'CONTACT', 'LEAD'];
const exportEntities: DataExportEntityType[] = ['COMPANY', 'CONTACT', 'LEAD', 'PROJECT', 'TASK'];
const duplicateEntities: DuplicateEntityType[] = ['COMPANY', 'CONTACT', 'LEAD'];

function entityOptions(values: string[]) {
  return values.map((value) => ({ label: value[0] + value.slice(1).toLowerCase(), value }));
}

function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataManagementSettings() {
  const current = useCurrentUser();
  const [jobs, setJobs] = useState<DataJobsResponse>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importEntity, setImportEntity] = useState<DataImportEntityType>('COMPANY');
  const [importCsv, setImportCsv] = useState('name,website,email,phone,status\n');
  const [preview, setPreview] = useState<ImportPreview>();
  const [exportEntity, setExportEntity] = useState<DataExportEntityType>('COMPANY');
  const [duplicateEntity, setDuplicateEntity] = useState<DuplicateEntityType>('COMPANY');
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>();
  const canImport = current.permissions.includes('data.import');
  const canExport = current.permissions.includes('data.export');
  const canReadDuplicates = current.permissions.includes('data.duplicates.read');

  async function loadJobs() {
    try {
      setJobs((await apiRequest<{ data: DataJobsResponse }>('/data-management/jobs')).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load data jobs.');
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  async function previewImport() {
    setError('');
    setMessage('');
    try {
      setPreview(
        (
          await apiRequest<{ data: ImportPreview }>('/data-management/imports/preview', {
            method: 'POST',
            body: JSON.stringify({
              entityType: importEntity,
              fileName: `${importEntity.toLowerCase()}-import.csv`,
              csv: importCsv,
            }),
          })
        ).data,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not preview import.');
    }
  }

  async function commitImport() {
    setError('');
    setMessage('');
    try {
      const result = (
        await apiRequest<{ data: { failedRows: number; successRows: number; totalRows: number } }>(
          '/data-management/imports',
          {
            method: 'POST',
            body: JSON.stringify({
              entityType: importEntity,
              fileName: `${importEntity.toLowerCase()}-import.csv`,
              csv: importCsv,
            }),
          },
        )
      ).data;
      setMessage(`Imported ${result.successRows} of ${result.totalRows} rows.`);
      await loadJobs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import CSV.');
    }
  }

  async function exportData() {
    setError('');
    setMessage('');
    try {
      const result = (
        await apiRequest<{ data: ExportResult }>('/data-management/exports', {
          method: 'POST',
          body: JSON.stringify({ entityType: exportEntity }),
        })
      ).data;
      downloadCsv(result.fileName, result.csv);
      setMessage(`Exported ${result.rowCount} ${exportEntity.toLowerCase()} rows.`);
      await loadJobs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export data.');
    }
  }

  async function findDuplicates() {
    setError('');
    setMessage('');
    try {
      setDuplicates(
        (
          await apiRequest<{ data: DuplicateGroup[] }>(
            `/data-management/duplicates?entityType=${duplicateEntity}`,
          )
        ).data,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not find duplicates.');
    }
  }

  if (!jobs && !error) return <LoadingState label="Loading data management" />;

  return (
    <section className="settings-section settings-section--wide">
      <header className="settings-section-header">
        <div>
          <h2>Data Management</h2>
          <p>Import reviewed CSV files, export records, and review duplicate CRM data.</p>
        </div>
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage>{message}</AuthMessage> : null}

      {canImport ? (
        <div className="configuration-list">
          <div className="configuration-row configuration-row--stacked">
            <div>
              <strong>CSV import</strong>
              <small>Supported columns are validated before rows are inserted.</small>
            </div>
            <Select
              label="Entity"
              value={importEntity}
              onValueChange={(value) => setImportEntity(value as DataImportEntityType)}
              options={entityOptions(importEntities)}
            />
            <Textarea
              aria-label="CSV import content"
              rows={8}
              value={importCsv}
              onChange={(event) => setImportCsv(event.target.value)}
            />
            <div>
              <Button type="button" variant="secondary" onClick={() => void previewImport()}>
                <Search size={14} />
                Preview
              </Button>
              <Button type="button" onClick={() => void commitImport()}>
                <Upload size={14} />
                Import CSV
              </Button>
            </div>
          </div>
          {preview ? (
            <div className="configuration-row configuration-row--stacked">
              <strong>Preview: {preview.totalRows} rows</strong>
              {preview.issues.length ? (
                <ul>
                  {preview.issues.slice(0, 8).map((issue) => (
                    <li key={`${issue.row}-${issue.message}`}>
                      Row {issue.row}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <small>No validation issues found.</small>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {canExport || canReadDuplicates ? (
        <div className="configuration-list">
          {canExport ? (
            <div className="configuration-row">
              <div>
                <strong>CSV export</strong>
                <small>Exports active records visible to your organization.</small>
              </div>
              <Select
                label="Entity"
                value={exportEntity}
                onValueChange={(value) => setExportEntity(value as DataExportEntityType)}
                options={entityOptions(exportEntities)}
              />
              <Button type="button" onClick={() => void exportData()}>
                <Download size={14} />
                Export
              </Button>
            </div>
          ) : null}

          {canReadDuplicates ? (
            <div className="configuration-row configuration-row--stacked">
              <div>
                <strong>Duplicate review</strong>
                <small>
                  Groups possible duplicate records by normalized email, phone, or name.
                </small>
              </div>
              <Select
                label="Entity"
                value={duplicateEntity}
                onValueChange={(value) => setDuplicateEntity(value as DuplicateEntityType)}
                options={entityOptions(duplicateEntities)}
              />
              <Button type="button" variant="secondary" onClick={() => void findDuplicates()}>
                <Search size={14} />
                Find duplicates
              </Button>
              {duplicates ? (
                <div>
                  {duplicates.length ? (
                    duplicates.slice(0, 10).map((group) => (
                      <p key={group.key}>
                        <strong>{group.key}</strong>:{' '}
                        {group.matches.map((match) => match.label).join(', ')}
                      </p>
                    ))
                  ) : (
                    <small>No duplicate candidates found.</small>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="configuration-list">
        <div className="configuration-row configuration-row--stacked">
          <strong>Recent jobs</strong>
          <table className="settings-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Entity</th>
                <th>Status</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {jobs?.imports.map((job) => (
                <tr key={job.id}>
                  <td>Import</td>
                  <td>{job.entityType}</td>
                  <td>{job.status}</td>
                  <td>
                    {job.successRows}/{job.totalRows}
                  </td>
                </tr>
              ))}
              {jobs?.exports.map((job) => (
                <tr key={job.id}>
                  <td>Export</td>
                  <td>{job.entityType}</td>
                  <td>{job.status}</td>
                  <td>{job.rowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
