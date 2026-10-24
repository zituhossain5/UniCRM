export interface DemoTourStep {
  id: string;
  title: string;
  description: string;
  route: string;
  highlight: string;
  actionLabel: string;
}

export const DEMO_TOUR_STEPS: readonly DemoTourStep[] = [
  {
    id: 'dashboard',
    title: 'Start with the customer overview',
    description:
      'See the sales pipeline, work requiring attention, and recent customer activity in one place.',
    route: '/app/dashboard',
    highlight: 'dashboard',
    actionLabel: 'View the lead journey',
  },
  {
    id: 'lead',
    title: 'Meet the demo lead',
    description:
      'Customer Portal Development connects Apex Commerce Ltd. and Amina Rahman. You can also create a lead from here.',
    route: '/app/leads',
    highlight: 'demo-lead',
    actionLabel: 'See lead conversion',
  },
  {
    id: 'conversion',
    title: 'Convert qualified demand',
    description:
      'Open the demo lead to see how a qualified lead can become a company, contact, and deal without losing history.',
    route: '/app/leads',
    highlight: 'leads',
    actionLabel: 'Open the deal pipeline',
  },
  {
    id: 'pipeline',
    title: 'Manage the deal pipeline',
    description:
      'Track opportunities by stage, owner, priority, and value while keeping the full customer context attached.',
    route: '/app/deals',
    highlight: 'deal-pipeline',
    actionLabel: 'Build a quotation',
  },
  {
    id: 'quotation',
    title: 'Build quotations from the catalog',
    description:
      'Reuse products and services such as Website Development, UI/UX Design, and Maintenance in consistent quotations.',
    route: '/app/quotations',
    highlight: 'quotation',
    actionLabel: 'Follow delivery',
  },
  {
    id: 'project',
    title: 'Turn won work into delivery',
    description:
      'A won deal can become a linked project so commercial context carries into implementation.',
    route: '/app/projects',
    highlight: 'projects',
    actionLabel: 'Plan the work',
  },
  {
    id: 'tasks',
    title: 'Coordinate tasks and activities',
    description:
      'Assign work, track due dates, and use the calendar for calls, meetings, and follow-ups.',
    route: '/app/tasks',
    highlight: 'tasks',
    actionLabel: 'Visit the shared inbox',
  },
  {
    id: 'inbox',
    title: 'Keep customer communication together',
    description:
      'The shared inbox organizes conversations, ownership, replies, notes, and CRM links in one workspace.',
    route: '/app/email',
    highlight: 'shared-inbox',
    actionLabel: 'Review customer support',
  },
  {
    id: 'case',
    title: 'Resolve customer cases',
    description:
      'Cases connect customer issues to the related company, contact, email thread, priority, and owner.',
    route: '/app/cases',
    highlight: 'cases',
    actionLabel: 'Explore automation',
  },
  {
    id: 'automation',
    title: 'Automate controlled CRM work',
    description:
      'Rules use approved triggers, conditions, and actions with auditable run history and safe execution.',
    route: '/app/settings/automations',
    highlight: 'automations',
    actionLabel: 'Review the forecast',
  },
  {
    id: 'forecast',
    title: 'Understand the revenue outlook',
    description:
      'Forecast views summarize pipeline value and expected outcomes without losing the underlying deal detail.',
    route: '/app/forecast',
    highlight: 'forecast',
    actionLabel: 'Finish with reports',
  },
  {
    id: 'reports',
    title: 'Turn CRM activity into insight',
    description:
      'Reports bring sales, delivery, and customer operations together for a complete view of performance.',
    route: '/app/reports',
    highlight: 'reports',
    actionLabel: 'Complete tour',
  },
] as const;

export type DemoTourPhase = 'not-started' | 'active' | 'paused' | 'skipped' | 'completed';

export interface DemoTourState {
  welcomeSeen: boolean;
  phase: DemoTourPhase;
  stepIndex: number;
}

export const INITIAL_DEMO_TOUR_STATE: DemoTourState = {
  welcomeSeen: false,
  phase: 'not-started',
  stepIndex: 0,
};

export type DemoTourEvent =
  | { type: 'START' }
  | { type: 'EXPLORE' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP' }
  | { type: 'CLOSE' }
  | { type: 'RESUME' }
  | { type: 'RESTART' };

export function reduceDemoTour(state: DemoTourState, event: DemoTourEvent): DemoTourState {
  switch (event.type) {
    case 'START':
    case 'RESTART':
      return { welcomeSeen: true, phase: 'active', stepIndex: 0 };
    case 'EXPLORE':
      return { ...state, welcomeSeen: true, phase: 'skipped' };
    case 'SKIP':
      return { ...state, welcomeSeen: true, phase: 'skipped' };
    case 'CLOSE':
      return { ...state, welcomeSeen: true, phase: 'paused' };
    case 'RESUME':
      return { ...state, welcomeSeen: true, phase: 'active' };
    case 'BACK':
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
    case 'NEXT':
      return state.stepIndex >= DEMO_TOUR_STEPS.length - 1
        ? { ...state, phase: 'completed' }
        : { ...state, stepIndex: state.stepIndex + 1 };
  }
}

export function demoTourStorageKey(organizationId: string, expiresAt: string | null): string {
  return `unicrm:demo-tour:${organizationId}:${expiresAt ?? 'session'}`;
}

export function parseDemoTourState(value: string | null): DemoTourState {
  if (!value) return INITIAL_DEMO_TOUR_STATE;
  try {
    const parsed = JSON.parse(value) as Partial<DemoTourState>;
    const validPhase = ['not-started', 'active', 'paused', 'skipped', 'completed'].includes(
      parsed.phase ?? '',
    );
    if (!validPhase) return INITIAL_DEMO_TOUR_STATE;
    return {
      welcomeSeen: parsed.welcomeSeen === true,
      phase: parsed.phase as DemoTourPhase,
      stepIndex: Math.min(
        DEMO_TOUR_STEPS.length - 1,
        Math.max(0, Number.isInteger(parsed.stepIndex) ? (parsed.stepIndex as number) : 0),
      ),
    };
  } catch {
    return INITIAL_DEMO_TOUR_STATE;
  }
}
