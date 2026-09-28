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

export const dashboardTourSteps: TourStep[] = [
  {
    title: 'tour.dashboard.0.title',
    body: 'tour.dashboard.0.body',
  },
  {
    title: 'tour.dashboard.1.title',
    body: 'tour.dashboard.1.body',
    target: '.dashboard > canvas',
    spotlightPadding: 0,
    interactive: true,
    waitForEvent: 'pointerdown',
  },
  {
    title: 'tour.dashboard.2.title',
    body: 'tour.dashboard.2.body',
    target: '.dashboard > canvas',
    spotlightPadding: 0,
    interactive: true,
    waitForEvent: 'wheel',
  },
  {
    title: 'tour.dashboard.3.title',
    body: 'tour.dashboard.3.body',
    target: '.dashboard > canvas',
    spotlightPadding: 0,
    interactive: true,
    waitForEvent: 'contextmenu',
  },
  {
    title: 'tour.dashboard.4.title',
    body: 'tour.dashboard.4.body',
    target: '.dashboard > canvas',
    spotlightPadding: 0,
    interactive: true,
    waitForKey: ' ',
  },
  {
    title: 'tour.dashboard.5.title',
    body: 'tour.dashboard.5.body',
  },
  {
    title: 'tour.dashboard.6.title',
    body: 'tour.dashboard.6.body',
  },
  {
    title: 'tour.dashboard.7.title',
    body: 'tour.dashboard.7.body',
  },
  {
    title: 'tour.dashboard.8.title',
    body: 'tour.dashboard.8.body',
    target: '.side-panel',
    spotlightPadding: 0,
  },
  {
    title: 'tour.dashboard.9.title',
    body: 'tour.dashboard.9.body',
    target: '.side-panel-settings-btn',
    spotlightPadding: 4,
  },
  {
    title: 'tour.dashboard.10.title',
    body: 'tour.dashboard.10.body',
  },
  {
    title: 'tour.dashboard.11.title',
    body: 'tour.dashboard.11.body',
  },
];

export const editorTourSteps: TourStep[] = [
  {
    title: 'tour.editor.0.title',
    body: 'tour.editor.0.body',
  },
  {
    title: 'tour.editor.1.title',
    body: 'tour.editor.1.body',
    target: '.editor-tabs',
    spotlightPadding: 4,
    interactive: true,
    waitForEvent: 'click',
  },
  {
    title: 'tour.editor.2.title',
    body: 'tour.editor.2.body',
    target: '.editor-add-btn',
    spotlightPadding: 4,
    interactive: true,
    onEnterEvent: 'tour:switch-to-lights',
    waitForSelector: '.add-panel.open',
  },
  {
    title: 'tour.editor.3.title',
    body: 'tour.editor.3.body',
    passthrough: true,
    waitForCustomEvent: 'tour:form-filled',
  },
  {
    title: 'tour.editor.4.title',
    body: 'tour.editor.4.body',
    target: '.editor-canvas',
    spotlightPadding: 0,
    interactive: true,
    waitForCustomEvent: 'tour:gizmo-used',
  },
  {
    title: 'tour.editor.5.title',
    body: 'tour.editor.5.body',
    target: '.add-panel.open',
    spotlightPadding: 4,
  },
  {
    title: 'tour.editor.6.title',
    body: 'tour.editor.6.body',
    target: '.add-panel.open .btn-success',
    spotlightPadding: 4,
    interactive: true,
    waitForCustomEvent: 'tour:entity-saved',
    autoAdvance: true,
  },
  {
    title: 'tour.editor.7.title',
    body: 'tour.editor.7.body',
    target: '[data-tab="displays"]',
    spotlightPadding: 4,
    interactive: true,
    waitForEvent: 'click',
  },
  {
    title: 'tour.editor.8.title',
    body: 'tour.editor.8.body',
    target: '[data-tab="tubes"]',
    spotlightPadding: 4,
    interactive: true,
    waitForEvent: 'click',
  },
  {
    title: 'tour.editor.9.title',
    body: 'tour.editor.9.body',
  },
  {
    title: 'tour.editor.10.title',
    body: 'tour.editor.10.body',
  },
];
