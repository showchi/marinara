# Manifest V3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Marinara from Manifest V2 to Manifest V3 while preserving timer accuracy, toolbar behavior, options/history pages, notifications, countdown/expiration tabs, autostart alarms, and sounds.

**Architecture:** Replace the persistent background page with an MV3 extension service worker that owns event routing and persisted timer state. Move DOM-only and audio-only work out of the service worker into extension pages or an offscreen document, and make all background behavior recoverable after service worker suspension. Keep the Vue option/countdown/expire pages as normal extension pages.

**Tech Stack:** Chrome Extensions MV3, Vue 2, Vue CLI 4/Webpack, Chrome extension APIs, `chrome.storage`, `chrome.alarms`, `chrome.notifications`, `chrome.action`, `chrome.offscreen`.

---

## Current Project Findings

- Manifest source is `package/manifest.json`; package allowlist is `scripts/package-manifest.json`.
- Build entries are configured in `vue.config.js`; background currently builds as `package/modules/background.js` plus shared chunks.
- Current MV2 manifest uses `manifest_version: 2`, `browser_action`, `background.persistent: true`, `background.scripts`, and MV2 CSP string.
- Background runtime in `src/background/main.js` assumes a long-lived JS process and constructs singleton `settings`, `timer`, `history`, `menu`, and services once.
- `src/background/Timer.js` uses `setTimeout` and `setInterval` for timer expiry and ticking. This is not reliable in an MV3 service worker because the worker can be suspended.
- `src/Sounds.js`, `src/Metronome.js`, and `src/Noise.js` use `AudioContext`; extension service workers do not have DOM/window audio APIs.
- `src/background/Observers.js` and `src/Chrome.js` use `window.screen`; service workers do not have `window`.
- `src/background/SingletonPage.js` uses `chrome.extension.getViews()` and direct page `window` mutation to find/update existing extension pages. This is not a viable MV3 service worker pattern.
- MV2 API names appear in:
  - `chrome.browserAction` in `src/background/main.js` and `src/background/Observers.js`.
  - `chrome.extension.getURL` in `src/background/Observers.js`, `src/background/Services.js`, and `src/background/Expiration.js`.
  - Context menu context `browser_action` in `src/background/Menu.js`.
  - Inline `onclick` menu handlers in `src/background/Menu.js`.
- Existing unit tests cover timer phase behavior and history merge behavior only. There are no tests for service worker rehydration, action/badge APIs, context menu dispatch, audio delegation, or singleton page behavior.

## Migration Strategy

Do not start by flipping `manifest_version`. First make the background model restartable under MV2 tests, then switch the manifest and APIs, then add offscreen audio and manual Chrome verification.

The central behavioral change is timer persistence. Store timer status as data in `chrome.storage.local` and use `chrome.alarms` for expiry wakeups. UI ticks should be derived from `Date.now()` when the worker is awake and from page-side intervals in countdown pages. The service worker should be able to initialize from storage on every event and compute whether a timer is running, paused, stopped, or already expired.

## File Structure To Modify

- Modify `package/manifest.json`: MV3 manifest syntax, `action`, service worker, CSP object, permissions, minimum Chrome version.
- Modify `scripts/package-manifest.json`: include any new offscreen page bundle files.
- Modify `vue.config.js`: build service worker as a single file or configure chunks so MV3 can load it predictably.
- Modify `src/background/main.js`: idempotent service worker bootstrap, event listeners registered at top level, no assumption of persistent globals.
- Modify `src/background/Timer.js`: add serializable timer state and rehydration paths, or split pure timer state into a new module.
- Create `src/background/TimerStateStore.js`: persist and load current timer snapshot from `chrome.storage.local`.
- Modify `src/background/Alarms.js`: use named alarms for autostart and active timer expiry; do not call `clearAll()`.
- Modify `src/background/Observers.js`: replace action API, remove direct `window.screen`, delegate audio.
- Modify `src/background/Menu.js`: replace inline `onclick` handlers with stable menu ids and a central `chrome.contextMenus.onClicked` dispatcher.
- Modify `src/background/SingletonPage.js`: replace `chrome.extension.getViews()` with `chrome.tabs.query()` over extension URLs and message passing to pages when hash/properties must change.
- Modify `src/background/Services.js`, `src/background/Expiration.js`: replace `chrome.extension.getURL` with `chrome.runtime.getURL`.
- Modify `src/Chrome.js`: add MV3-compatible wrapper methods for `chrome.action`, `chrome.runtime.getURL`, `chrome.tabs.remove`, offscreen setup, and screen-size requests.
- Create `src/offscreen/offscreen.html` and `src/offscreen/main.js`: handle sound playback and long-running timer sounds through `chrome.runtime.onMessage`.
- Modify `src/Sounds.js`, `src/Metronome.js`, `src/Noise.js`, `src/TimerSound.js`: run only in offscreen/page contexts; expose command handlers instead of constructing audio in the service worker.
- Add tests under `tests/unit/` for timer serialization, alarm scheduling, menu id dispatch, and API name migration.

---

### Task 1: Capture Current Behavior And Add Missing Safety Tests

**Files:**
- Modify: `tests/unit/timer.spec.js`
- Create: `tests/unit/timer-state-store.spec.js`
- Create: `tests/unit/menu.spec.js`

- [ ] **Step 1: Add tests for serializable timer snapshots**

Create tests that assert a running focus timer can be converted to plain JSON and restored without losing `phase`, `nextPhase`, `state`, `checkpointStartAt`, `checkpointElapsed`, and `pomodoros`.

- [ ] **Step 2: Add tests for service worker restart scenarios**

Cover these cases:
- Worker restarts while timer is running and expiry is still in the future.
- Worker restarts while timer should already have expired.
- Worker restarts while timer is paused.
- Settings changed while timer is stopped.

- [ ] **Step 3: Add menu dispatch tests**

Test that menu ids map to `startFocus`, `startShortBreak`, `startLongBreak`, `pause`, `resume`, `stop`, `startCycle`, and `showHistoryPage` without relying on inline callback closures.

- [ ] **Step 4: Run baseline tests**

Run: `npm run test:unit`

Expected: current tests pass after dependencies are installed. In this checkout, `vue-cli-service` is unavailable until `npm install` or equivalent dependency restoration is performed.

---

### Task 2: Make Timer State Restartable

**Files:**
- Modify: `src/background/Timer.js`
- Create: `src/background/TimerStateStore.js`
- Modify: `src/background/main.js`
- Modify: `tests/unit/timer.spec.js`
- Modify: `tests/unit/timer-state-store.spec.js`

- [ ] **Step 1: Add timer snapshot methods**

Add methods similar to:

```js
snapshot() {
  return {
    phase: this.phase,
    pomodoros: this.pomodoros,
    advanceTimer: this.advanceTimer,
    timer: this.timer.status
  };
}
```

and a restore path that takes a snapshot plus settings and recreates the `PomodoroTimer`.

- [ ] **Step 2: Persist after every state transition**

In the service worker bootstrap, observe `start`, `stop`, `pause`, `resume`, `expire`, and settings changes, then write the snapshot to `chrome.storage.local`.

- [ ] **Step 3: Derive expiry from absolute time**

When a timer starts or resumes, store an absolute `expiresAt` timestamp. On worker startup, compare `Date.now()` with `expiresAt`:
- If `Date.now() < expiresAt`, restore as running and reschedule the expiry alarm.
- If `Date.now() >= expiresAt`, process expiry once and advance state.
- If paused, restore elapsed values without scheduling expiry.

- [ ] **Step 4: Keep UI status computed, not interval-owned**

`PomodoroService.getStatus()` should compute `elapsed` and `remaining` from persisted timestamps. Page-side clients may keep their own one-minute UI interval, but the worker should not depend on an in-memory `setInterval`.

---

### Task 3: Replace MV2 Manifest And API Names

**Files:**
- Modify: `package/manifest.json`
- Modify: `src/background/main.js`
- Modify: `src/background/Observers.js`
- Modify: `src/background/Menu.js`
- Modify: `src/background/Services.js`
- Modify: `src/background/Expiration.js`
- Modify: `src/Chrome.js`

- [ ] **Step 1: Change manifest shape**

Use this target structure:

```json
{
  "manifest_version": 3,
  "permissions": [
    "alarms",
    "contextMenus",
    "storage",
    "notifications",
    "offscreen"
  ],
  "action": {
    "default_title": "Marinara",
    "default_icon": "images/browser-action.png"
  },
  "background": {
    "service_worker": "modules/background.js"
  },
  "options_page": "modules/options.html",
  "minimum_chrome_version": "109",
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

- [ ] **Step 2: Replace action APIs**

Replace:
- `chrome.browserAction.onClicked` with `chrome.action.onClicked`.
- `chrome.browserAction.setTitle` with `chrome.action.setTitle`.
- `chrome.browserAction.setBadgeText` with `chrome.action.setBadgeText`.
- `chrome.browserAction.setBadgeBackgroundColor` with `chrome.action.setBadgeBackgroundColor`.
- Context menu context `browser_action` with `action`.

- [ ] **Step 3: Replace extension URL APIs**

Replace `chrome.extension.getURL(...)` with `chrome.runtime.getURL(...)`.

- [ ] **Step 4: Remove `chrome.extension.getViews()` dependency**

Implement singleton page lookup via `chrome.tabs.query({ url: chrome.runtime.getURL('modules/countdown.html') + '*' })` and equivalent URL patterns. Update existing tabs with `chrome.tabs.update(tabId, { active, url })` when the hash must change.

---

### Task 4: Make Context Menus MV3-Compatible

**Files:**
- Modify: `src/background/Menu.js`
- Modify: `src/background/main.js`
- Modify: `tests/unit/menu.spec.js`

- [ ] **Step 1: Assign stable ids to menu actions**

Each menu item should create a deterministic id, such as `start-focus`, `start-short-break`, `start-long-break`, `pause`, `resume`, `stop`, `start-cycle`, and `history`.

- [ ] **Step 2: Remove inline `onclick` from `chrome.contextMenus.create()`**

MV3 service workers should register event listeners separately. Use:

```js
chrome.contextMenus.onClicked.addListener((info) => {
  menu.dispatch(info.menuItemId);
});
```

- [ ] **Step 3: Register listener once**

Ensure listener registration happens at top-level bootstrap and does not multiply on every worker wake.

---

### Task 5: Move Audio To An Offscreen Document

**Files:**
- Create: `src/offscreen/offscreen.html`
- Create: `src/offscreen/main.js`
- Modify: `vue.config.js`
- Modify: `scripts/package-manifest.json`
- Modify: `src/background/Observers.js`
- Modify: `src/Sounds.js`
- Modify: `src/TimerSound.js`
- Modify: `src/Metronome.js`
- Modify: `src/Noise.js`

- [ ] **Step 1: Add an offscreen page build entry**

Add a Vue CLI page or plain Webpack entry that emits `package/modules/offscreen.html` and `package/modules/offscreen.js`.

- [ ] **Step 2: Add offscreen document manager**

Create a background helper that calls `chrome.offscreen.createDocument()` with:
- `url: 'modules/offscreen.html'`
- `reasons: ['AUDIO_PLAYBACK']`
- a justification string explaining timer and notification sounds.

- [ ] **Step 3: Route one-shot notification sounds**

Replace direct `Sounds.play(filename)` calls in the service worker with `chrome.runtime.sendMessage({ target: 'offscreen-audio', command: 'play', filename })`.

- [ ] **Step 4: Route long-running timer sounds**

Replace service-worker-owned `TimerSoundObserver.timerSound` objects with offscreen commands:
- `startTimerSound`
- `pauseTimerSound`
- `resumeTimerSound`
- `stopTimerSound`
- `closeTimerSound`

- [ ] **Step 5: Keep audio implementation document-only**

`AudioContext`, `ScriptProcessorNode`, and sound decoding remain in `src/Sounds.js`, `src/Metronome.js`, and `src/Noise.js`, but these modules must only be imported by `src/offscreen/main.js` or visible pages, not by the service worker bundle.

---

### Task 6: Remove Service Worker DOM/Window Assumptions

**Files:**
- Modify: `src/background/Observers.js`
- Modify: `src/Chrome.js`
- Modify: `src/countdown/Countdown.vue`
- Modify: `src/background/SingletonPage.js`

- [ ] **Step 1: Remove `window.screen` from service worker code**

For countdown popup sizing, use a conservative default size or ask a visible extension page to provide screen dimensions by message. Do not access `window` in `src/background`.

- [ ] **Step 2: Keep page focus/update operations tab-based**

Use `chrome.tabs.update`, `chrome.windows.update`, and `chrome.tabs.query` only. Do not mutate extension page globals from the service worker.

- [ ] **Step 3: Move hash/property updates through URL or runtime messages**

For expiration/countdown pages, pass initial data through service calls or storage. If an existing tab is reused, update its URL hash or send a runtime message that the page listens for.

---

### Task 7: Update Build Output For MV3 Service Worker

**Files:**
- Modify: `vue.config.js`
- Modify: `package/manifest.json`
- Modify: `scripts/package-manifest.json`

- [ ] **Step 1: Ensure service worker can load all code**

MV3 `background.service_worker` points to one file. Either keep `modules/background.js` self-contained or explicitly use module service worker support with a build output Chrome can load.

- [ ] **Step 2: Prevent HTML background artifact assumptions**

Keep deleting `package/modules/background.html`, but verify the service worker bundle does not depend on injected HTML chunk loading.

- [ ] **Step 3: Update package allowlist**

Add:
- `modules/offscreen.html`
- `modules/offscreen.js`

Remove or keep chunk files only according to the final Webpack output.

---

### Task 8: Manual Chrome Verification

**Files:**
- No source changes unless verification finds defects.

- [ ] **Step 1: Build**

Run: `npm run build`

Expected: `package/modules/background.js`, page bundles, and offscreen bundle are emitted without CSP or chunk loading errors.

- [ ] **Step 2: Load unpacked extension**

Open `chrome://extensions`, enable developer mode, load the `package/` directory, and inspect the service worker console.

- [ ] **Step 3: Verify timer workflows**

Check:
- Toolbar click starts, pauses, resumes.
- Badge text/title update.
- Focus expiry records history.
- Short and long break transitions still match existing tests.
- Autostart alarm schedules and fires.
- Context menu actions work after service worker restart.

- [ ] **Step 4: Verify page workflows**

Check:
- Options page opens each route.
- History page reads, imports, exports, and clears history.
- Countdown tab/window opens and reuses existing page.
- Expiration tab opens, focuses, and closes correctly.

- [ ] **Step 5: Verify audio workflows**

Check:
- Notification sound plays on expiry.
- Timer sound starts on focus, pauses, resumes, and stops.
- Offscreen document is created only when needed and does not replace the service worker as an always-on background page.

---

## Risks And Mitigations

- Timer accuracy risk: MV3 service workers suspend. Mitigate with persisted `expiresAt` and `chrome.alarms`, not in-memory timeout ownership.
- Audio risk: `AudioContext` is unavailable in service workers. Mitigate with `chrome.offscreen` and keep audio code in the offscreen document.
- Menu risk: inline context menu callbacks are fragile with worker restarts. Mitigate with stable ids plus `onClicked` dispatch.
- Singleton page risk: `chrome.extension.getViews()` is a background-page-era shortcut. Mitigate with `tabs.query` and runtime messaging.
- Build risk: MV3 service worker loading can fail if Webpack emits dynamic chunks. Mitigate by validating actual `package/modules/background.js` in Chrome before release.

## Reference Docs

- Chrome MV3 background service worker manifest: https://developer.chrome.com/docs/extensions/mv3/manifest/background
- Chrome MV3 service worker basics: https://developer.chrome.com/docs/extensions/mv3/service_workers/basics
- Chrome MV3 migration overview: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- Chrome MV3 action API change: https://developer.chrome.com/blog/mv3-actions/
- Chrome offscreen API: https://developer.chrome.com/docs/extensions/reference/api/offscreen
