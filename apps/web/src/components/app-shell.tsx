'use client';

import {
  Avatar,
  Button,
  Dialog,
  DropdownMenu,
  type DropdownItem,
  IconButton,
  Input,
  PageContainer,
  Popover,
  Sheet,
  Tooltip,
} from '@unicrm/ui';
import {
  CompanyCreateSheet,
  ContactCreateSheet,
  LeadCreateSheet,
} from '@/components/crm/create-sheets';
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  FileText,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTheme } from './theme-provider';
import { useCurrentUser } from './auth-provider';
import { apiRequest } from '@/lib/api';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
}
interface NavSection {
  label?: string;
  items: readonly NavItem[];
}

const navSections: readonly NavSection[] = [
  { items: [{ href: '/app/dashboard', icon: LayoutDashboard, label: 'Overview' }] },
  {
    label: 'CRM',
    items: [
      { href: '/app/leads', icon: UsersRound, label: 'Leads' },
      { href: '/app/companies', icon: Building2, label: 'Companies' },
      { href: '/app/contacts', icon: ContactRound, label: 'Contacts' },
    ],
  },
  {
    label: 'Projects',
    items: [
      { href: '/app/projects', icon: ClipboardList, label: 'Projects' },
      { href: '/app/tasks', icon: ListChecks, label: 'Tasks' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/app/quotations', icon: FileText, label: 'Quotations' },
      { href: '/app/payments', icon: CircleDollarSign, label: 'Payments' },
    ],
  },
  { items: [{ href: '/app/reports', icon: ChartNoAxesColumn, label: 'Reports' }] },
];

const commandItems = navSections
  .flatMap((section) => section.items)
  .concat({ href: '/app/settings', icon: Settings, label: 'Settings' });

type GlobalCreateTarget = 'lead' | 'company' | 'contact';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const user = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<GlobalCreateTarget | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredCommands = useMemo(
    () => commandItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const createItems = useMemo(() => {
    const items: DropdownItem[] = [];
    if (user.permissions.includes('lead.create'))
      items.push({ label: 'New Lead', onClick: () => setCreateTarget('lead') });
    if (user.permissions.includes('company.create'))
      items.push({ label: 'New Company', onClick: () => setCreateTarget('company') });
    if (user.permissions.includes('contact.create'))
      items.push({ label: 'New Contact', onClick: () => setCreateTarget('contact') });
    return items;
  }, [user.permissions]);
  const navigation = <Navigation collapsed={collapsed} pathname={pathname} />;

  return (
    <div className={`app-frame${collapsed ? ' app-frame--collapsed' : ''}`}>
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-symbol">U</span>
          <span className="brand-copy">
            <strong>UniCRM</strong>
            <small>UnicodeIT</small>
          </span>
        </div>
        {navigation}
        <div className="sidebar-footer">
          <NavLink
            collapsed={collapsed}
            href="/app/settings"
            icon={Settings}
            label="Settings"
            pathname={pathname}
          />
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <IconButton
              className="sidebar-collapse"
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <ChevronRight size={16} />
              ) : (
                <>
                  <ChevronLeft size={16} />
                  <span>Collapse</span>
                </>
              )}
            </IconButton>
          </Tooltip>
        </div>
      </aside>

      <header className="topbar">
        <div className="mobile-nav">
          <Sheet
            description="Navigate UniCRM"
            title="UniCRM"
            trigger={
              <IconButton label="Open navigation">
                <Menu size={18} />
              </IconButton>
            }
          >
            <div className="mobile-navigation">
              {navigation}
              <NavLink href="/app/settings" icon={Settings} label="Settings" pathname={pathname} />
            </div>
          </Sheet>
        </div>
        <button className="search-trigger" onClick={() => setCommandOpen(true)} type="button">
          <Search size={16} />
          <span>Search or jump to...</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="topbar-actions">
          {createItems.length ? (
            <DropdownMenu
              label="Create menu"
              items={createItems}
              trigger={
                <Button aria-label="Create" className="create-button">
                  <Plus size={16} />
                  <span>Create</span>
                </Button>
              }
            />
          ) : (
            <Button aria-disabled="true" aria-label="Create" className="create-button" disabled>
              <Plus size={16} />
              <span>Create</span>
            </Button>
          )}
          <Popover
            trigger={
              <IconButton className="notification-button" label="Notifications">
                <Bell size={17} />
              </IconButton>
            }
          >
            <div className="notification-popover">
              <strong>No new notifications</strong>
              <span>Updates will appear here.</span>
            </div>
          </Popover>
          <Tooltip content={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <IconButton
              className="theme-button"
              label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
          </Tooltip>
          <DropdownMenu
            label="User menu"
            items={[
              {
                label: (
                  <span className="user-menu-identity">
                    <strong>
                      {user.firstName} {user.lastName}
                    </strong>
                    <small>{user.email}</small>
                  </span>
                ),
                disabled: true,
              },
              { label: <Link href="/app/settings/security">Security</Link> },
              {
                label: 'Sign out',
                onClick: () => {
                  void apiRequest('/auth/logout', { method: 'POST' }).finally(() =>
                    window.location.assign('/login'),
                  );
                },
              },
            ]}
            trigger={
              <button aria-label="Open user menu" className="avatar-button" type="button">
                <Avatar
                  fallback={`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}
                  label={`${user.firstName} ${user.lastName}`}
                  size="sm"
                />
              </button>
            }
          />
        </div>
      </header>

      <main className="app-main">
        <PageContainer>{children}</PageContainer>
      </main>

      {user.permissions.includes('lead.create') ? (
        <LeadCreateSheet
          open={createTarget === 'lead'}
          onOpenChange={(open) => setCreateTarget(open ? 'lead' : null)}
          trigger={
            <button className="visually-hidden" type="button">
              New lead
            </button>
          }
        />
      ) : null}
      {user.permissions.includes('company.create') ? (
        <CompanyCreateSheet
          open={createTarget === 'company'}
          onOpenChange={(open) => setCreateTarget(open ? 'company' : null)}
          trigger={
            <button className="visually-hidden" type="button">
              New company
            </button>
          }
        />
      ) : null}
      {user.permissions.includes('contact.create') ? (
        <ContactCreateSheet
          open={createTarget === 'contact'}
          onOpenChange={(open) => setCreateTarget(open ? 'contact' : null)}
          trigger={
            <button className="visually-hidden" type="button">
              New contact
            </button>
          }
        />
      ) : null}

      <Dialog
        description="Navigate between UniCRM areas. Business search will arrive in a later milestone."
        onOpenChange={setCommandOpen}
        open={commandOpen}
        title="Command palette"
        trigger={
          <button className="visually-hidden" type="button">
            Open command palette
          </button>
        }
      >
        <div className="command-palette">
          <div className="command-input">
            <Search size={17} />
            <Input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a page name..."
              value={query}
            />
          </div>
          <div className="command-results">
            {filteredCommands.length ? (
              filteredCommands.map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    setCommandOpen(false);
                    setQuery('');
                    router.push(item.href);
                  }}
                  type="button"
                >
                  <item.icon size={16} />
                  <span>Go to {item.label}</span>
                </button>
              ))
            ) : (
              <p>No matching destinations.</p>
            )}
          </div>
          <div className="command-footer">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> Navigate
            </span>
            <span>
              <kbd>Esc</kbd> Close
            </span>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Navigation({ collapsed = false, pathname }: { collapsed?: boolean; pathname: string }) {
  return (
    <nav aria-label="Primary navigation" className="sidebar-navigation">
      {navSections.map((section, index) => (
        <div className="nav-section" key={section.label ?? index}>
          {section.label ? <p>{section.label}</p> : null}
          {section.items.map((item) => (
            <NavLink
              collapsed={collapsed}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
              pathname={pathname}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavLink({
  collapsed = false,
  href,
  icon: Icon,
  label,
  pathname,
}: NavItem & { collapsed?: boolean; pathname: string }) {
  const link = (
    <Link
      aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}
      className="nav-link"
      href={href}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{label}</span>
    </Link>
  );
  return collapsed ? <Tooltip content={label}>{link}</Tooltip> : link;
}
