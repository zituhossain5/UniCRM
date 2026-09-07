export type DataImportEntityType = 'COMPANY' | 'CONTACT' | 'LEAD';
export type DataExportEntityType = DataImportEntityType | 'PROJECT' | 'TASK';
export type DuplicateEntityType = DataImportEntityType;
export type MergeEntityType = 'COMPANY' | 'CONTACT';

export interface DataImportJob {
  id: string;
  entityType: DataImportEntityType;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  completedAt: string | null;
}

export interface DataExportJob {
  id: string;
  entityType: DataExportEntityType;
  fileName: string;
  status: string;
  rowCount: number;
  sizeBytes: number;
  createdAt: string;
  completedAt: string | null;
}

export interface DataJobsResponse {
  imports: DataImportJob[];
  exports: DataExportJob[];
}

export interface ImportPreview {
  headers: string[];
  issues: { message: string; row: number }[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface ExportResult extends DataExportJob {
  csv: string;
}

export interface DuplicateGroup {
  key: string;
  matches: { id: string; label: string; secondary?: string | null }[];
}
