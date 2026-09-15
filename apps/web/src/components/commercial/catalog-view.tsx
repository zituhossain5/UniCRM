'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  CatalogItem,
  CatalogItemType,
  CatalogListResponse,
  CatalogReferences,
} from '@/lib/catalog-types';
import { formatMoney } from '@/lib/commercial-types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
  Sheet,
  Switch,
  Textarea,
} from '@unicrm/ui';
import { Archive, Boxes, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const FORM_ID = 'catalog-item-form';

export function CatalogView() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<CatalogListResponse>();
  const [references, setReferences] = useState<CatalogReferences>();
  const [selected, setSelected] = useState<CatalogItem>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState('true');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [itemActive, setItemActive] = useState(true);
  const [newType, setNewType] = useState<CatalogItemType>('SERVICE');
  const [error, setError] = useState('');
  const canCreate = user.permissions.includes('catalog.create');
  const canUpdate = user.permissions.includes('catalog.update');
  const canDelete = user.permissions.includes('catalog.delete');

  const load = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        sort: 'name',
        order: 'asc',
      });
      if (query.trim()) params.set('search', query.trim());
      if (type) params.set('type', type);
      if (category) params.set('category', category);
      if (active) params.set('active', active);
      if (currency) params.set('currency', currency);
      const [items, refs] = await Promise.all([
        apiRequest<CatalogListResponse>(`/catalog?${params}`),
        apiRequest<{ data: CatalogReferences }>('/catalog/reference-data'),
      ]);
      setResult(items);
      setReferences(refs.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the catalog.');
    }
  }, [active, category, currency, page, query, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const requested = searchParams.get('create');
    if (!requested || !canCreate) return;
    setSelected(undefined);
    setItemActive(true);
    setNewType(requested === 'product' ? 'PRODUCT' : 'SERVICE');
    setEditorOpen(true);
    router.replace('/app/catalog');
  }, [canCreate, router, searchParams]);

  function openCreate(type: CatalogItemType = 'SERVICE') {
    setSelected(undefined);
    setItemActive(true);
    setNewType(type);
    setEditorOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    setBusy(true);
    setError('');
    try {
      await apiRequest(selected ? `/catalog/${selected.id}` : '/catalog', {
        method: selected ? 'PATCH' : 'POST',
        body: JSON.stringify({
          type: field('type'),
          name: field('name'),
          sku: field('sku') || null,
          categoryId: field('categoryId') || null,
          description: field('description') || null,
          unitPrice: field('unitPrice'),
          currency: field('currency'),
          taxRate: field('taxRate') || null,
          active: data.get('active') === 'true',
        }),
      });
      setEditorOpen(false);
      setSelected(undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the catalog item.');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest(`/catalog/${selected.id}`, { method: 'DELETE' });
      setEditorOpen(false);
      setSelected(undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive the catalog item.');
    } finally {
      setBusy(false);
    }
  }

  async function createCategory() {
    const name = window.prompt('Category name')?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await apiRequest('/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the category.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-page catalog-page">
      <PageHeader
        title="Product & Service Catalog"
        description="Reusable commercial items for deals and quotations."
        actions={
          canCreate ? (
            <>
              <Button disabled={busy} onClick={() => void createCategory()} variant="outline">
                New category
              </Button>
              <Button onClick={() => openCreate()}>
                <Plus size={15} /> New item
              </Button>
            </>
          ) : undefined
        }
      />
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <div className="crm-toolbar catalog-toolbar">
        <label className="crm-search">
          <Search size={16} />
          <Input
            aria-label="Search catalog"
            placeholder="Search name, SKU, or description..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          label="Type"
          value={type}
          onValueChange={(value) => {
            setType(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All types', value: '' },
            { label: 'Product', value: 'PRODUCT' },
            { label: 'Service', value: 'SERVICE' },
          ]}
        />
        <Select
          label="Category"
          value={category}
          onValueChange={(value) => {
            setCategory(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All categories', value: '' },
            ...(references?.categories ?? []).map((item) => ({ label: item.name, value: item.id })),
          ]}
        />
        <Select
          label="Status"
          value={active}
          onValueChange={(value) => {
            setActive(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All statuses', value: '' },
            { label: 'Active', value: 'true' },
            { label: 'Inactive', value: 'false' },
          ]}
        />
        <Input
          aria-label="Currency filter"
          className="catalog-currency-filter"
          maxLength={3}
          placeholder="Currency"
          value={currency}
          onChange={(event) => {
            setCurrency(event.target.value.toUpperCase());
            setPage(1);
          }}
        />
      </div>
      {!result && !error ? <LoadingState label="Loading catalog" /> : null}
      {error && !result ? (
        <ErrorState
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {result && !result.data.length ? (
        <EmptyState
          icon={<Boxes size={20} />}
          title="No catalog items"
          description="Add a reusable product or service for deals and quotations."
          action={canCreate ? <Button onClick={() => openCreate()}>Create item</Button> : undefined}
        />
      ) : null}
      {result?.data.length ? (
        <>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Unit price</th>
                  <th>Tax</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((item) => (
                  <tr className="catalog-row" key={item.id}>
                    <td>
                      <button
                        className="catalog-row-button"
                        onClick={() => {
                          setSelected(item);
                          setItemActive(item.active);
                          setEditorOpen(true);
                        }}
                        type="button"
                      >
                        <strong>{item.name}</strong>
                        <span>{item.description ?? 'No description'}</span>
                      </button>
                    </td>
                    <td>{item.type === 'PRODUCT' ? 'Product' : 'Service'}</td>
                    <td>{item.sku ?? '—'}</td>
                    <td>{item.category?.name ?? '—'}</td>
                    <td>{formatMoney(item.unitPrice, item.currency)}</td>
                    <td>{item.taxRate ? `${item.taxRate}%` : '—'}</td>
                    <td>
                      <Badge tone={item.active ? 'success' : 'neutral'}>
                        {item.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={result.meta.page}
            totalPages={result.meta.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : null}
      <Sheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={selected ? selected.name : 'New catalog item'}
        trigger={<span hidden />}
        footer={
          (selected ? canUpdate : canCreate) ? (
            <>
              <Button variant="secondary" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button form={FORM_ID} loading={busy} type="submit">
                {selected ? 'Save changes' : 'Create item'}
              </Button>
            </>
          ) : undefined
        }
      >
        <form className="dialog-form" id={FORM_ID} onSubmit={(event) => void save(event)}>
          <Select
            key={`${selected?.id ?? 'new'}-${newType}`}
            label="Type"
            name="type"
            defaultValue={selected?.type ?? newType}
            options={[
              { label: 'Product', value: 'PRODUCT' },
              { label: 'Service', value: 'SERVICE' },
            ]}
          />
          <label>
            <span>Name</span>
            <Input defaultValue={selected?.name ?? ''} maxLength={180} name="name" required />
          </label>
          <label>
            <span>SKU</span>
            <Input defaultValue={selected?.sku ?? ''} maxLength={80} name="sku" />
          </label>
          <Select
            label="Category"
            name="categoryId"
            defaultValue={selected?.categoryId ?? ''}
            options={[
              { label: 'No category', value: '' },
              ...(
                references?.categories.filter(
                  (item) => item.active || item.id === selected?.categoryId,
                ) ?? []
              ).map((item) => ({ label: item.name, value: item.id })),
            ]}
          />
          <label>
            <span>Description</span>
            <Textarea
              defaultValue={selected?.description ?? ''}
              maxLength={10000}
              name="description"
            />
          </label>
          <div className="form-two-columns">
            <label>
              <span>Unit price</span>
              <Input
                defaultValue={selected?.unitPrice ?? '0'}
                min="0"
                name="unitPrice"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label>
              <span>Currency</span>
              <Input
                defaultValue={selected?.currency ?? references?.defaultCurrency ?? 'BDT'}
                maxLength={3}
                name="currency"
                required
              />
            </label>
          </div>
          <label>
            <span>Tax rate (%)</span>
            <Input
              defaultValue={selected?.taxRate ?? ''}
              max="100"
              min="0"
              name="taxRate"
              step="0.0001"
              type="number"
            />
          </label>
          <Switch
            checked={itemActive}
            label="Available for new deals and quotations"
            onCheckedChange={setItemActive}
          />
          <input name="active" type="hidden" value={itemActive ? 'true' : 'false'} />
          {selected && canDelete ? (
            <Button disabled={busy} onClick={() => void archive()} variant="destructive">
              <Archive size={15} /> Archive item
            </Button>
          ) : null}
        </form>
      </Sheet>
    </div>
  );
}
