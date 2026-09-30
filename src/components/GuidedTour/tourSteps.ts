export interface TourStep {
  title: string;
  body: string;
  /** CSS selector for the target element. If null, tooltip is centered. */
  target?: string;
  /** Extra padding around the spotlight (default: 8px). */
  spotlightPadding?: number;
  /** Allow the user to interact with the spotlight area (clicks pass through). */
  interactive?: boolean;
  /** Wait for a specific key press before allowing "Next" (e.g. ' ' for Space). */
  waitForKey?: string;
  /** Wait for a DOM event on the target element before allowing "Next". */
  waitForEvent?: string;
  /** Wait for a CSS selector to appear in the DOM, then auto-advance to next step. */
  waitForSelector?: string;
  /** Make the entire overlay pass-through (all clicks reach the app). */
  passthrough?: boolean;
  /** Custom event name to listen for on document (dispatched by app code). */
  waitForCustomEvent?: string;
  /** Custom event dispatched on document when this step becomes active. */
  onEnterEvent?: string;
  /** Automatically advance to next step when the wait condition is fulfilled. */
  autoAdvance?: boolean;
}

// Short dashboard tour after onboarding: no waiting for gestures, it just explains.
export const dashboardTourSteps: TourStep[] = [
  { title: 'tour.dashboard.0.title', body: 'tour.dashboard.0.body' },
  { title: 'tour.dashboard.1.title', body: 'tour.dashboard.1.body', target: '.dashboard > canvas', spotlightPadding: 0 },
  { title: 'tour.dashboard.2.title', body: 'tour.dashboard.2.body' },
  { title: 'tour.dashboard.3.title', body: 'tour.dashboard.3.body', target: '.side-panel', spotlightPadding: 0 },
  { title: 'tour.dashboard.4.title', body: 'tour.dashboard.4.body', target: '.side-panel-footer', spotlightPadding: 4 },
];
