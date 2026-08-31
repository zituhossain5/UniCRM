'use client';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmationDialog,
  Dialog,
  DropdownMenu,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Popover,
  RadioGroup,
  Select,
  Sheet,
  Skeleton,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  ToastDemoButton,
  Tooltip,
} from '@unicrm/ui';
import { Bell, MoreHorizontal, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';

const selectOptions = [
  { label: 'Sales', value: 'sales' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Support', value: 'support' },
];

export default function UIKitPage() {
  return (
    <main className="ui-kit-page">
      <PageHeader
        description="Development reference · semantic tokens, components, and interaction states"
        title="UniCRM UI kit"
      />

      <KitSection
        description="Semantic colors adapt to light and dark appearance."
        title="Color system"
      >
        <div className="token-grid">
          {[
            ['Background', 'background'],
            ['Surface', 'surface'],
            ['Text', 'foreground'],
            ['Muted text', 'muted'],
            ['Border', 'border'],
            ['Primary', 'primary'],
            ['Success', 'success'],
            ['Warning', 'warning'],
            ['Danger', 'danger'],
          ].map(([label, token]) => (
            <div className="token-item" key={token}>
              <span className={`token-swatch token-${token}`} />
              <span>{label}</span>
              <code>--{token === 'muted' ? 'muted-foreground' : token}</code>
            </div>
          ))}
        </div>
      </KitSection>

      <KitSection title="Typography">
        <div className="type-specimens">
          <p className="type-page-title">Page title · 24 / 600</p>
          <p className="type-section-title">Section heading · 16 / 600</p>
          <p>Body text · 14 / 400 for everyday product content.</p>
          <p className="small-copy">Small text · 13 / 400 for dense controls.</p>
          <p className="metadata-copy">METADATA · 12 / 500</p>
        </div>
      </KitSection>

      <KitSection title="Actions">
        <div className="component-row">
          <Button>
            <Plus size={15} />
            Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Tooltip content="Notification center">
            <IconButton label="Notifications">
              <Bell size={16} />
            </IconButton>
          </Tooltip>
        </div>
      </KitSection>

      <KitSection title="Forms">
        <div className="form-demo-grid">
          <Field label="Project name">
            <Input placeholder="e.g. Website redesign" />
          </Field>
          <Field label="Team">
            <Select defaultValue="sales" options={selectOptions} placeholder="Select team" />
          </Field>
          <Field label="Notes">
            <Textarea placeholder="Add a concise note..." rows={3} />
          </Field>
          <Field error="A valid work email is required." label="Work email">
            <Input defaultValue="not-an-email" invalid />
          </Field>
          <Field label="Disabled">
            <Input disabled placeholder="Unavailable" />
          </Field>
          <div className="choice-demo">
            <Checkbox defaultChecked label="Email updates" />
            <Checkbox disabled label="Disabled option" />
            <RadioGroup
              defaultValue="weekly"
              label="Summary cadence"
              options={[
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
              ]}
            />
            <Switch defaultChecked label="Desktop alerts" />
          </div>
        </div>
      </KitSection>

      <KitSection title="Identity and status">
        <div className="component-row">
          <Avatar fallback="ZH" label="Zitu Hasan" />
          <Avatar fallback="UI" label="UnicodeIT" size="lg" />
          <Badge>Draft</Badge>
          <StatusBadge status="New" />
          <StatusBadge status="Qualified" />
          <StatusBadge status="Proposal Sent" />
          <StatusBadge status="Won" />
          <StatusBadge status="Lost" />
        </div>
      </KitSection>

      <KitSection title="Navigation and overlays">
        <Tabs
          defaultValue="details"
          items={[
            {
              value: 'details',
              label: 'Details',
              content: <p className="muted-copy">Compact tabs for related views.</p>,
            },
            {
              value: 'activity',
              label: 'Activity',
              content: <p className="muted-copy">Activity content appears here.</p>,
            },
          ]}
        />
        <div className="component-row overlay-actions">
          <Dialog
            description="Focus is trapped while the dialog is open."
            title="Create workspace view"
            trigger={<Button variant="outline">Open dialog</Button>}
          >
            <Field label="View name">
              <Input placeholder="Pipeline review" />
            </Field>
            <div className="ui-dialog-actions">
              <Button variant="secondary">Cancel</Button>
              <Button>Create view</Button>
            </div>
          </Dialog>
          <Sheet
            description="A responsive edge panel for focused workflows."
            title="Display preferences"
            trigger={
              <Button variant="outline">
                <SlidersHorizontal size={15} />
                Open drawer
              </Button>
            }
          >
            <Switch defaultChecked label="Compact density" />
          </Sheet>
          <DropdownMenu
            items={[
              { label: 'Rename' },
              { label: 'Duplicate' },
              { label: 'Archive', disabled: true },
            ]}
            label="Example actions"
            trigger={
              <Button variant="outline">
                <MoreHorizontal size={15} />
                Dropdown
              </Button>
            }
          />
          <Popover trigger={<Button variant="outline">Popover</Button>}>
            <strong>Quick context</strong>
            <p className="muted-copy">Useful details without leaving the page.</p>
          </Popover>
          <ToastDemoButton>Show toast</ToastDemoButton>
          <ConfirmationDialog
            description="This demonstration does not change any data."
            title="Confirm this action?"
            trigger={<Button variant="destructive">Confirmation</Button>}
          />
        </div>
      </KitSection>

      <KitSection title="Feedback and loading">
        <div className="state-grid">
          <Card>
            <EmptyState
              description="Create an item when this workflow becomes available."
              icon={<Sparkles size={20} />}
              title="Nothing here yet"
            />
          </Card>
          <Card>
            <ErrorState description="Check the connection and try again." />
          </Card>
          <Card>
            <LoadingState label="Loading example" />
          </Card>
        </div>
        <div className="skeleton-line">
          <Skeleton />
          <Skeleton className="ui-skeleton-short" />
        </div>
        <Pagination currentPage={2} totalPages={8} />
      </KitSection>
    </main>
  );
}

function KitSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="kit-section">
      <div className="kit-section-heading">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
      {error ? <span className="ui-field-error">{error}</span> : null}
    </label>
  );
}
