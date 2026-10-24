import { describe, expect, it } from 'vitest';
import {
  DEMO_TOUR_STEPS,
  INITIAL_DEMO_TOUR_STATE,
  demoTourStorageKey,
  parseDemoTourState,
  reduceDemoTour,
} from '../../web/src/lib/demo-tour';
import { demoRestrictionCopy, isDemoExperienceEnabled } from '../../web/src/lib/demo-events';

describe('Milestone 21B guided public demo', () => {
  it('defines the complete ordered customer journey with stable targets', () => {
    expect(DEMO_TOUR_STEPS).toHaveLength(12);
    expect(DEMO_TOUR_STEPS.map((step) => step.id)).toEqual([
      'dashboard',
      'lead',
      'conversion',
      'pipeline',
      'quotation',
      'project',
      'tasks',
      'inbox',
      'case',
      'automation',
      'forecast',
      'reports',
    ]);
    expect(DEMO_TOUR_STEPS.every((step) => step.route.startsWith('/app/'))).toBe(true);
    expect(DEMO_TOUR_STEPS.every((step) => step.highlight.length > 0)).toBe(true);
  });

  it('supports start, next, back, pause, resume, skip, completion, and restart', () => {
    let state = reduceDemoTour(INITIAL_DEMO_TOUR_STATE, { type: 'START' });
    expect(state).toMatchObject({ welcomeSeen: true, phase: 'active', stepIndex: 0 });
    state = reduceDemoTour(state, { type: 'NEXT' });
    expect(state.stepIndex).toBe(1);
    state = reduceDemoTour(state, { type: 'BACK' });
    expect(state.stepIndex).toBe(0);
    state = reduceDemoTour(state, { type: 'CLOSE' });
    expect(state.phase).toBe('paused');
    state = reduceDemoTour(state, { type: 'RESUME' });
    expect(state.phase).toBe('active');
    state = { ...state, stepIndex: DEMO_TOUR_STEPS.length - 1 };
    expect(reduceDemoTour(state, { type: 'NEXT' }).phase).toBe('completed');
    expect(reduceDemoTour(state, { type: 'SKIP' }).phase).toBe('skipped');
    expect(reduceDemoTour(state, { type: 'RESTART' })).toMatchObject({
      phase: 'active',
      stepIndex: 0,
    });
  });

  it('scopes persisted progress to the current demo workspace and expiry', () => {
    expect(demoTourStorageKey('org-a', '2026-10-24T10:00:00.000Z')).not.toBe(
      demoTourStorageKey('org-b', '2026-10-24T10:00:00.000Z'),
    );
    expect(
      parseDemoTourState(JSON.stringify({ welcomeSeen: true, phase: 'paused', stepIndex: 999 })),
    ).toEqual({
      welcomeSeen: true,
      phase: 'paused',
      stepIndex: DEMO_TOUR_STEPS.length - 1,
    });
    expect(parseDemoTourState('{invalid')).toEqual(INITIAL_DEMO_TOUR_STATE);
  });

  it('activates only for DEMO organizations and explains restricted capabilities safely', () => {
    expect(isDemoExperienceEnabled('DEMO')).toBe(true);
    expect(isDemoExperienceEnabled('NORMAL')).toBe(false);
    expect(demoRestrictionCopy('/mailboxes')).toContain('real mailbox');
    expect(demoRestrictionCopy('/users/invitations')).toContain('Inviting teammates');
    expect(demoRestrictionCopy('/integrations')).toContain('External integrations');
    expect(demoRestrictionCopy('/data-management/exports')).toContain('Import, export');
  });
});
