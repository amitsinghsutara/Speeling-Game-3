# Implementation Plan: Spelling Adventure

**Status:** Initial proposal — confirm against the target deployment environment before coding.

## 1. Technical direction
- UI: React + TypeScript + Vite.
- Styling: CSS modules or plain CSS with reusable design tokens; choose one approach and use it consistently. Tailwind is also acceptable if already preferred in the repository.
- Content: validated JSON generated from the supplied spreadsheet.
- Tests: Vitest + React Testing Library.
- Persistence: a typed progress-storage interface, initially backed by localStorage for simple progress; use IndexedDB if later requirements justify it.
- Offline: PWA/service worker using a maintained solution compatible with the installed Vite version.
- Audio: typed `AudioProvider` abstraction; bundled recordings preferred for production consistency. Browser speech and native Android TTS are optional providers, selected by capability.
- Hosting: static hosting such as Cloudflare Pages is suitable for the web/PWA build.

## 2. Suggested architecture
```text
src/
  app/
    App.tsx
    routes.tsx                 # only if routing is needed
  components/
    HomeScreen.tsx
    LevelSelect.tsx
    QuestionScreen.tsx
    AnswerTile.tsx
    FeedbackPanel.tsx
    LevelCompleteScreen.tsx
    ProgressIndicator.tsx
  game/
    types.ts
    buildQuestion.ts
    evaluateAnswer.ts
    progression.ts
    scoring.ts
  content/
    levels.json
    validateContent.ts
    loadContent.ts
  audio/
    AudioProvider.ts
    BundledAudioProvider.ts
    BrowserSpeechProvider.ts
    NativeBridgeProvider.ts   # optional; only for agreed Android integration
  persistence/
    ProgressRepository.ts
    LocalProgressRepository.ts
    progressSchema.ts
  styles/
    tokens.css
    global.css
  test/
    fixtures/
```

Adjust this layout to the repository's conventions; do not create unnecessary folders merely to match this example.

## 3. Content model
Keep the raw source spreadsheet unchanged. Convert it through a repeatable import/validation script into a normalized JSON file. Preserve source row identifiers and design notes for traceability.

Illustrative item shape:
```ts
type FoilType = string; // Replace with a validated union after the source taxonomy is confirmed.

interface Foil {
  word: string;
  type: FoilType;
}

interface SpellingItem {
  id: string;
  level: number;
  itemNumber: number;
  sequenceInLevel: number;
  skillPattern: string;
  targetWord: string;
  foils: Foil[];
  realWordFoilCount?: number;
  l1TransferFoilCount?: number;
  designNote?: string;
}
```

Do not assume that foil type labels such as `V`, `FC`, and `IC` have known meanings until they are confirmed from the spreadsheet/documentation. Preserve the original labels during import.

## 4. Key interfaces
```ts
interface AudioProvider {
  playTarget(item: SpellingItem): Promise<void>;
  stop?(): void;
}

interface ProgressRepository {
  load(): Promise<GameProgress | null>;
  save(progress: GameProgress): Promise<void>;
  clear(): Promise<void>;
}

interface GameProgress {
  schemaVersion: number;
  currentLevel: number;
  currentItemId: string | null;
  completedItemIds: string[];
  completedLevels: number[];
  stars: number;
}
```

Keep these interfaces small. Adapt the shape if requirements clarify different resume/scoring behavior.

## 5. Data and game logic safeguards
- Validate the complete dataset before the game is playable.
- Use stable item IDs, not array indexes alone, for saved progress.
- Ensure target plus foils are unique case-insensitively unless content owners explicitly allow an exception.
- Use an injectable/randomizable shuffle function to make question generation testable.
- Keep scoring/progression pure where possible.
- Version saved progress and provide a safe migration/reset path.

## 6. Implementation phases
1. **Foundation:** project setup, lint/typecheck/test/build scripts, design tokens.
2. **Content:** spreadsheet import, schema, validation, representative fixtures.
3. **Game logic:** question construction, answer evaluation, scoring/progression tests.
4. **UI:** home, level selection, question, feedback, completion states.
5. **Audio:** provider abstraction and selected initial provider.
6. **Persistence:** local save/resume and invalid-state handling.
7. **Offline:** PWA manifest, service worker, caching, offline reload test.
8. **Polish:** responsive layout, accessibility, reduced motion, error states.
9. **Release:** test on target browsers/devices, build, deployment guide.

## 7. Test strategy
- Unit tests: content validation, question construction, duplicate choices, answer evaluation, scoring, progression, persistence schema.
- Component tests: replay audio, select answer, feedback, next question, completion screen, restore progress.
- Offline checks: fresh load and cache installation; reload while offline; play a question while offline; reload saved progress while offline.
- Manual checks: touch targets, narrow viewport, keyboard focus, reduced motion, audio errors, Android WebView if included.

## 8. Risks and mitigations
- **Incomplete spreadsheet:** import and validate early; block release on missing required rows.
- **Inconsistent speech:** prefer bundled audio for production; document platform fallback behavior.
- **Offline cache gaps:** explicitly test offline reload, not just an already-open tab.
- **Scope creep:** keep AI feedback, accounts, remote analytics, and cloud sync out of the first release.
- **Unclear learning rules:** resolve retry, scoring, and progression before implementing those mechanics.

## 9. Decisions required before final plan
Confirm the open questions in `spec.md`, especially target platform, audio strategy, incorrect-answer behavior, scoring, level unlocking, and the complete dataset.
