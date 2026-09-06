export type ConfigurableEntityType = 'LEAD' | 'COMPANY' | 'CONTACT' | 'PROJECT';
export type SavedViewEntityType = ConfigurableEntityType | 'TASK';
export type CustomFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'CURRENCY'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'URL'
  | 'EMAIL'
  | 'PHONE';

export interface CustomFieldDefinition {
  id: string;
  entityType: ConfigurableEntityType;
  name: string;
  key: string;
  fieldType: CustomFieldType;
  required: boolean;
  position: number;
  options: string[] | null;
  active: boolean;
}
export interface CustomFieldEntry {
  definition: CustomFieldDefinition;
  value: unknown;
}
export interface Tag {
  id: string;
  name: string;
}
export interface ConfigurableRecordMetadata {
  customFields?: CustomFieldEntry[];
  tags?: Tag[];
}
export interface SavedView {
  id: string;
  entityType: SavedViewEntityType;
  name: string;
  filters: Record<string, unknown>;
  sort: { field: string; order: 'asc' | 'desc' } | null;
  columns: string[] | null;
  visibility: 'PRIVATE' | 'ORGANIZATION';
  isDefault: boolean;
  userId: string | null;
}
