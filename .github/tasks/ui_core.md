Read RUNNER_APP_SPEC.md section §6 completely — all UI wireframes.
Read all component stubs in components/.
Read lib/store.ts (implemented).

Your task: Build the core reusable UI components.

Design system:
  Primary blue:   #0078D4 (Microsoft brand)
  Success green:  #107C10
  Error red:      #D83B01
  Background:     #F5F5F5
  Card bg:        #FFFFFF
  Text primary:   #201F1E
  Text secondary: #605E5C
  Border radius:  12px (cards), 8px (buttons)
  Font:           Inter
  Touch target:   minimum 48px height (mobile)
  Shadow:         0 2px 8px rgba(0,0,0,0.08)

Required deliverables:

- components/DeptCard.tsx
  Props: dept, isCurrent, isDisabled, onClick
  Current dept: blue left border, greyed, "Currently here" badge
  Available dept: white card, full opacity, hover/active state
  Disabled: 0.4 opacity, no pointer events
  Height: 64px minimum (touch-friendly)
  Animation: subtle scale on press (transform: scale(0.98))

- components/RunnerHeader.tsx
  Props: displayName, extensionNumber, pbxName, pbxFqdn
  Shows: name (bold), extension + PBX name (secondary text)
  Compact — max 72px height
  Avatar: initials circle (blue background)

- components/StatusBadge.tsx
  Props: deptName, color variant
  "Currently in: Sales" — pill badge
  Variants: active (green), switching (yellow), error (red)

- components/ConfirmSheet.tsx
  Radix Dialog (bottom sheet on mobile)
  Props: fromDept, toDept, onConfirm, onCancel, isLoading
  Shows: "{fromDept} → {toDept}"
  Two buttons: Cancel (ghost) + Confirm (blue, full width)
  Loading state: spinner on Confirm button, both disabled
  Slides up from bottom on mobile (CSS: bottom sheet pattern)

- components/ErrorScreen.tsx
  Props: errorCode, onRetry?
  Maps every error code from §13 to human-readable German + English
  Shows icon per error type (🚫 not-a-runner, 📡 PBX down, ⏱ rate limited)
  Shows retry button only where recovery is possible

- components/LoadingScreen.tsx
  Full-screen loading state
  Runner Hub logo + spinner
  Used during auth and dept switching

- components/ui/ (shared primitives)
  Button.tsx (variants: primary, ghost, destructive)
  Card.tsx (wrapper with shadow + border radius)
  Spinner.tsx (animated, sizes: sm/md/lg)
  Badge.tsx (pill variants)

- tests/components/ (one file per component)
  Render tests for all states
  Interaction tests (click, disabled state)
  Accessibility: role attributes, aria-labels

Commit to feature/ui-core.
Open PR: "feat: core UI component library"
Update BUILD_STATE.json: ui_core.status = "complete"
