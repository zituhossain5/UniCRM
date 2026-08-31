'use client';

import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { Check, X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Button, IconButton } from './primitives';

export interface OverlayProps {
  children: ReactNode;
  description?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: ReactNode;
  trigger: ReactElement;
}

export function Dialog({
  children,
  description,
  onOpenChange,
  open,
  title,
  trigger,
}: OverlayProps) {
  return (
    <BaseDialog.Root onOpenChange={onOpenChange} open={open}>
      <BaseDialog.Trigger render={trigger} />
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ui-overlay" />
        <BaseDialog.Viewport className="ui-dialog-viewport">
          <BaseDialog.Popup className="ui-dialog-popup">
            <div className="ui-dialog-header">
              <div>
                <BaseDialog.Title>{title}</BaseDialog.Title>
                {description ? (
                  <BaseDialog.Description>{description}</BaseDialog.Description>
                ) : null}
              </div>
              <BaseDialog.Close
                render={
                  <IconButton label="Close dialog">
                    <X size={17} />
                  </IconButton>
                }
              />
            </div>
            <div className="ui-dialog-content">{children}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function Sheet({ children, description, onOpenChange, open, title, trigger }: OverlayProps) {
  return (
    <BaseDialog.Root onOpenChange={onOpenChange} open={open}>
      <BaseDialog.Trigger render={trigger} />
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ui-overlay" />
        <BaseDialog.Viewport className="ui-sheet-viewport">
          <BaseDialog.Popup className="ui-sheet-popup">
            <div className="ui-dialog-header">
              <div>
                <BaseDialog.Title>{title}</BaseDialog.Title>
                {description ? (
                  <BaseDialog.Description>{description}</BaseDialog.Description>
                ) : null}
              </div>
              <BaseDialog.Close
                render={
                  <IconButton label="Close panel">
                    <X size={17} />
                  </IconButton>
                }
              />
            </div>
            <div className="ui-dialog-content">{children}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function Popover({ children, trigger }: { children: ReactNode; trigger: ReactElement }) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner className="ui-popup-positioner" sideOffset={6}>
          <BasePopover.Popup className="ui-popover-popup">{children}</BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

export function Tooltip({ children, content }: { children: ReactElement; content: ReactNode }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={7}>
          <BaseTooltip.Popup className="ui-tooltip-popup">{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export interface DropdownItem {
  disabled?: boolean;
  label: ReactNode;
  onClick?: () => void;
}

export function DropdownMenu({
  items,
  label,
  trigger,
}: {
  items: readonly DropdownItem[];
  label?: string;
  trigger: ReactElement;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner className="ui-popup-positioner" sideOffset={6}>
          <Menu.Popup aria-label={label} className="ui-menu-popup">
            {items.map((item, index) => (
              <Menu.Item
                className="ui-menu-item"
                disabled={item.disabled}
                key={index}
                onClick={item.onClick}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export interface TabItem {
  content: ReactNode;
  label: ReactNode;
  value: string;
}

export function Tabs({ defaultValue, items }: { defaultValue: string; items: readonly TabItem[] }) {
  return (
    <BaseTabs.Root className="ui-tabs" defaultValue={defaultValue}>
      <BaseTabs.List className="ui-tabs-list">
        {items.map((item) => (
          <BaseTabs.Tab className="ui-tab" key={item.value} value={item.value}>
            {item.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="ui-tabs-indicator" />
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel className="ui-tab-panel" key={item.value} value={item.value}>
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}

export function ConfirmationDialog({
  confirmLabel = 'Confirm',
  description,
  onConfirm,
  title,
  trigger,
}: {
  confirmLabel?: string;
  description: ReactNode;
  onConfirm?: () => void;
  title: ReactNode;
  trigger: ReactElement;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger render={trigger} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="ui-overlay" />
        <AlertDialog.Viewport className="ui-dialog-viewport">
          <AlertDialog.Popup className="ui-dialog-popup ui-confirmation-popup">
            <AlertDialog.Title>{title}</AlertDialog.Title>
            <AlertDialog.Description>{description}</AlertDialog.Description>
            <div className="ui-dialog-actions">
              <AlertDialog.Close render={<Button variant="secondary">Cancel</Button>} />
              <AlertDialog.Close
                render={
                  <Button onClick={onConfirm} variant="destructive">
                    <Check size={15} />
                    {confirmLabel}
                  </Button>
                }
              />
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export const TooltipProvider = BaseTooltip.Provider;
