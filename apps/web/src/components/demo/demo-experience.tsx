'use client';

import { Button, Dialog, IconButton } from '@unicrm/ui';
import { Check, ChevronLeft, RotateCcw, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  DEMO_BLOCKED_EVENT,
  demoRestrictionCopy,
  isDemoExperienceEnabled,
  type DemoBlockedDetail,
} from '@/lib/demo-events';
import {
  DEMO_TOUR_STEPS,
  INITIAL_DEMO_TOUR_STATE,
  demoTourStorageKey,
  parseDemoTourState,
  reduceDemoTour,
  type DemoTourEvent,
  type DemoTourState,
} from '@/lib/demo-tour';
import { env } from '@/lib/env';
import { toRuntimePath } from '@/lib/runtime';

const COMPLETION_ITEMS = [
  'Manage leads, contacts, companies, and deals',
  'Create quotations from a reusable catalog',
  'Move won work into projects and tasks',
  'Coordinate activities, inbox conversations, and cases',
  'Automate controlled actions with auditable history',
  'Review forecasts and operational reports',
] as const;

function remainingMinutes(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

export function DemoExperience() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const isDemo = isDemoExperienceEnabled(user.organization.mode);
  const storageKey = useMemo(
    () => demoTourStorageKey(user.organization.id, user.organization.demoExpiresAt),
    [user.organization.demoExpiresAt, user.organization.id],
  );
  const [tour, setTour] = useState<DemoTourState>(INITIAL_DEMO_TOUR_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');
  const [blockedPath, setBlockedPath] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = DEMO_TOUR_STEPS[tour.stepIndex] ?? DEMO_TOUR_STEPS[0];

  const transition = useCallback((event: DemoTourEvent) => {
    setTour((current) => reduceDemoTour(current, event));
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    setTour(parseDemoTourState(window.sessionStorage.getItem(storageKey)));
    setHydrated(true);
  }, [isDemo, storageKey]);

  useEffect(() => {
    if (!isDemo || !hydrated) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(tour));
  }, [hydrated, isDemo, storageKey, tour]);

  useEffect(() => {
    if (!isDemo) return;
    const onBlocked = (event: Event) =>
      setBlockedPath((event as CustomEvent<DemoBlockedDetail>).detail.path);
    window.addEventListener(DEMO_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(DEMO_BLOCKED_EVENT, onBlocked);
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo || tour.phase !== 'active') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') transition({ type: 'CLOSE' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDemo, tour.phase, transition]);

  useEffect(() => {
    document.querySelectorAll('.demo-tour-highlight').forEach((element) => {
      element.classList.remove('demo-tour-highlight');
    });
    if (!isDemo || tour.phase !== 'active' || !step) return;
    let attempts = 0;
    let timer = 0;
    const highlight = () => {
      const target = document.querySelector(`[data-demo-tour="${step.highlight}"]`);
      if (target) target.classList.add('demo-tour-highlight');
      else if (attempts < 12) {
        attempts += 1;
        timer = window.setTimeout(highlight, 150);
      }
    };
    headingRef.current?.focus({ preventScroll: true });
    timer = window.setTimeout(highlight, 80);
    return () => {
      window.clearTimeout(timer);
      document.querySelectorAll('.demo-tour-highlight').forEach((element) => {
        element.classList.remove('demo-tour-highlight');
      });
    };
  }, [isDemo, pathname, step, tour.phase]);

  const navigateToStep = useCallback(
    (nextState: DemoTourState) => {
      const nextStep = DEMO_TOUR_STEPS[nextState.stepIndex];
      if (nextState.phase === 'active' && nextStep)
        router.push(toRuntimePath(nextStep.route, 'DEMO'));
    },
    [router],
  );

  const updateTour = (event: DemoTourEvent) => {
    const next = reduceDemoTour(tour, event);
    setTour(next);
    navigateToStep(next);
  };

  const restartDemo = async () => {
    setRestarting(true);
    setRestartError('');
    try {
      await apiRequest<{ data: { expiresAt: string } }>('/demo/restart', { method: 'POST' });
      window.sessionStorage.removeItem(storageKey);
      window.location.assign('/demo');
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : 'The demo could not be restarted.');
      setRestarting(false);
    }
  };

  if (!isDemo) return null;
  const minutes = remainingMinutes(user.organization.demoExpiresAt);
  const contactUrl = env.NEXT_PUBLIC_DEMO_CONTACT_URL ?? 'mailto:sales@unicodeit.com';
  const tourButtonLabel =
    tour.phase === 'active'
      ? 'Guided Tour'
      : tour.phase === 'paused'
        ? 'Resume Tour'
        : 'Guided Tour';

  return (
    <>
      <div className="demo-workspace-banner" role="status">
        <div className="demo-workspace-banner__copy">
          <strong>DEMO WORKSPACE</strong>
          <span>
            Sample data · Changes are temporary{minutes ? ` · ${minutes} min remaining` : ''}
          </span>
        </div>
        <div className="demo-workspace-banner__actions">
          <Button
            onClick={() =>
              updateTour(
                tour.phase === 'paused' || tour.phase === 'active'
                  ? { type: 'RESUME' }
                  : { type: 'RESTART' },
              )
            }
            variant="outline"
          >
            {tourButtonLabel}
          </Button>
          <Button onClick={() => setRestartOpen(true)} variant="ghost">
            <RotateCcw aria-hidden="true" size={14} />
            Restart Demo
          </Button>
        </div>
      </div>

      <Dialog
        description={
          minutes
            ? `This isolated demo workspace expires in about ${minutes} minutes.`
            : 'This is an isolated, temporary demo workspace.'
        }
        onOpenChange={(open) => {
          if (!open && !tour.welcomeSeen) transition({ type: 'EXPLORE' });
        }}
        open={hydrated && !tour.welcomeSeen}
        title="Welcome to UniCRM"
        trigger={
          <button className="visually-hidden" type="button">
            Open demo welcome
          </button>
        }
      >
        <div className="demo-welcome">
          <p>
            Explore a complete customer journey from lead and quotation through delivery, email,
            support, automation, and reporting. All records are fictional and reset automatically.
          </p>
          <div className="demo-welcome__actions">
            <Button onClick={() => updateTour({ type: 'START' })}>Start Guided Tour</Button>
            <Button onClick={() => transition({ type: 'EXPLORE' })} variant="outline">
              Explore on My Own
            </Button>
          </div>
        </div>
      </Dialog>

      {hydrated && tour.phase === 'active' && step ? (
        <aside aria-label="UniCRM guided tour" className="demo-tour-panel">
          <div className="demo-tour-panel__header">
            <span>Guided tour</span>
            <IconButton label="Pause guided tour" onClick={() => transition({ type: 'CLOSE' })}>
              <X aria-hidden="true" size={16} />
            </IconButton>
          </div>
          <ol
            aria-label={`Tour progress, step ${tour.stepIndex + 1} of ${DEMO_TOUR_STEPS.length}`}
            className="demo-tour-progress"
          >
            {DEMO_TOUR_STEPS.map((item, index) => (
              <li
                aria-current={index === tour.stepIndex ? 'step' : undefined}
                className={index <= tour.stepIndex ? 'is-reached' : undefined}
                key={item.id}
              >
                <span className="visually-hidden">{item.title}</span>
              </li>
            ))}
          </ol>
          <small>
            Step {tour.stepIndex + 1} of {DEMO_TOUR_STEPS.length}
          </small>
          <h2 ref={headingRef} tabIndex={-1}>
            {step.title}
          </h2>
          <p>{step.description}</p>
          <div className="demo-tour-panel__actions">
            <Button
              aria-label="Previous tour step"
              disabled={tour.stepIndex === 0}
              onClick={() => updateTour({ type: 'BACK' })}
              variant="ghost"
            >
              <ChevronLeft aria-hidden="true" size={15} /> Back
            </Button>
            <Button onClick={() => updateTour({ type: 'NEXT' })}>{step.actionLabel}</Button>
          </div>
          <button
            className="demo-tour-skip"
            onClick={() => transition({ type: 'SKIP' })}
            type="button"
          >
            Skip tour
          </button>
        </aside>
      ) : null}

      {hydrated && tour.phase === 'completed' ? (
        <aside
          aria-label="Guided tour complete"
          className="demo-tour-panel demo-tour-panel--complete"
        >
          <span className="demo-tour-complete-icon">
            <Check aria-hidden="true" size={18} />
          </span>
          <h2>You're ready to explore UniCRM</h2>
          <p>You have seen how one connected workspace supports the full customer lifecycle.</p>
          <ul>
            {COMPLETION_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="demo-tour-panel__actions">
            <Button onClick={() => updateTour({ type: 'RESTART' })} variant="outline">
              Restart Tour
            </Button>
            <a className="ui-button ui-button--primary" href={contactUrl}>
              Contact Sales
            </a>
          </div>
          <button
            className="demo-tour-skip"
            onClick={() => transition({ type: 'SKIP' })}
            type="button"
          >
            Continue exploring
          </button>
        </aside>
      ) : null}

      <Dialog
        description="This replaces only your temporary demo workspace. Normal UniCRM workspaces are never affected."
        onOpenChange={setRestartOpen}
        open={restartOpen}
        title="Restart this demo?"
        trigger={
          <button className="visually-hidden" type="button">
            Restart demo
          </button>
        }
      >
        <div className="demo-restart-dialog">
          <p>
            Your current sample changes will be removed and a fresh 90-minute demo will be created.
          </p>
          {restartError ? (
            <p className="form-error" role="alert">
              {restartError}
            </p>
          ) : null}
          <div className="demo-welcome__actions">
            <Button disabled={restarting} onClick={() => setRestartOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button loading={restarting} onClick={() => void restartDemo()}>
              Restart Demo
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        description="This capability is intentionally disabled in the public demo."
        onOpenChange={(open) => {
          if (!open) setBlockedPath(null);
        }}
        open={blockedPath !== null}
        title="Available in a full workspace"
        trigger={
          <button className="visually-hidden" type="button">
            Open demo restriction
          </button>
        }
      >
        <div className="demo-blocked-dialog">
          <p>{demoRestrictionCopy(blockedPath ?? '')}</p>
          <p>
            Your demo data remains safe, and you can continue exploring all enabled CRM workflows.
          </p>
          <a className="ui-button ui-button--primary" href={contactUrl}>
            Contact Sales
          </a>
        </div>
      </Dialog>
    </>
  );
}
