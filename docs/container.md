# Android container integration

The game runs as a normal web app, and also inside a native Android app (the container) through a WebView. Everything it needs from the container is **detected by capability** on `window.Android`, never by user agent. In a normal browser none of it exists, and the game behaves the same.

The code is in `src/platform/containerBridge.ts`.

| Container method | Status | Used for |
|---|---|---|
| `cachedStatus(true)` | **Confirmed.** Speeling Game 2 uses it the same way. | Called once the service worker has cached everything for offline play, or on launch when a cached version is already in control |
| Exit method | **Unconfirmed.** The game checks, in order, for `closeApp`, `exitApp`, `close` and `finish` (`EXIT_METHOD_CANDIDATES`). | The door button on the Welcome, level, puzzle map and question screens, after a "Leave the forest?" confirmation |

## Behaviour

- **Hidden when unavailable:** the exit button only appears if one of the candidate methods is a function.
- **Mid-puzzle:** the door is also on the question screen. There the dialog adds that the puzzle will start again next time, because only finished puzzles are saved.
- **Leaving:** "Yes, leave" stops the sound and calls the method with `window.Android` as `this`. If the container throws, the game simply stays open.
- **Progress is already saved,** since it's written on every change.
- **No crashes from the bridge:** all bridge calls are wrapped, so a missing or failing bridge never breaks the game.

## To do with the container team

1. Confirm the real exit method name, then replace `EXIT_METHOD_CANDIDATES` with just that name (task T019e).
2. Test inside the real WebView (task T019c). Check audio, offline launch, the press feedback, the hold-to-open gate and safe areas.
3. Optionally, agree an Android back-button behaviour, for example "back goes to the previous screen".

## Testing locally without the container

Define a fake bridge before the app loads, for example on a scratch page:

```html
<script>window.Android = { closeApp() { console.log('exit called') }, cachedStatus(v) { console.log('cached', v) } }</script>
```

The bridge is covered by tests in `src/platform/containerBridge.test.ts`, `src/pwa/status.test.ts` and `src/App.test.tsx`.
