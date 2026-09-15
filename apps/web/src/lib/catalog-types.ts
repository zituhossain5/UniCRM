import type { PaginationMeta } from './crm-types';

export type CatalogItemType = 'PRODUCT' | 'SERVICE';

export interface CatalogCategory {
  id: string;
  name: string;
  active: boolean;
  archivedAt: string | null;
}

export interface CatalogItem {
  id: string;
  type: CatalogItemType;
  name: string;
  sku: string | null;
  description: string | null;
  categoryId: string | null;
  category: CatalogCategory | null;
  unitPrice: string;
  currency: string;
  taxRate: string | null;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogListResponse {
  data: CatalogItem[];
  meta: PaginationMeta;
}

export interface CatalogReferences {
  categories: CatalogCategory[];
  defaultCurrency: string;
}
