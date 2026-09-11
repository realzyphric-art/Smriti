# MemoryCare Mobile Optimization

## Baseline

The application is mobile-first and already includes safe-area padding, fixed header and bottom navigation spacing, minimum touch targets, responsive grids, sheets with bounded height, reduced-motion support, large text, jumbo buttons and high contrast.

## Safe changes in this preparation pass

- Route-level lazy loading was added for authentication, password recovery, admin diagnostics, game play and caregiver pages. The initial bundle no longer needs to eagerly evaluate those route modules.
- The existing design system and route behavior were preserved.
- The lazy route fallback is a neutral loading state and does not change page content or navigation.
- The app continues to use the existing `prefers-reduced-motion` and in-app reduced-motion settings.

## Required verification widths

Test the major patient and caregiver routes at 320px, 360px, 390px, 414px and a normal desktop width. Check:

- no horizontal scrolling caused by content
- header title, read-screen control and avatar remain visible
- bottom navigation labels remain readable and tappable
- sheets and dialogs scroll internally instead of exceeding the viewport
- keyboards do not hide the active field or Save/Cancel actions
- large text, jumbo buttons, high contrast and reduced motion remain usable
- loading and error states do not cause large layout shifts

Do not add `overflow-x: hidden` as a substitute for finding the offending element. Fix the element's width, wrapping, flex behavior or media constraints instead.

## Measurement notes

Use the browser's layout inspector or a device emulator to record viewport width, document `scrollWidth`, client width, largest asset and initial JS transfer. Compare a baseline build with the lazy-loaded build. A useful result is a smaller initial route chunk, not a large number of speculative memoization changes.

## Future safe work

- Add automated viewport smoke tests with a browser runner.
- Add explicit image width/height and responsive source selection where image-heavy routes need it.
- Add abort/cancellation to long-running requests where the service supports it.
- Profile before adding `memo`, `useMemo` or `useCallback`.
