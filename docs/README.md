# Spelling Adventure documentation

Spelling Adventure is an offline-first spelling and phonics game for early readers (ages 5–8), with Fern the fox. A child hears a word and picks its spelling from four tiles. An adaptive engine on the device decides what comes next. Optional AI (Gemini) helps choose among options the engine already allows, and writes suggestions for grown-ups.

- **Live:** https://spelling-adventure-68z.pages.dev
- **Repository root:** [`README.md`](../README.md) has the quick start.

## Start here

| If you want to… | Read |
|---|---|
| Understand how the pieces fit | [Architecture](architecture.md) |
| Change words, foils or levels | [Content pipeline](content.md) |
| Understand or tune what the game asks next | [Adaptive learning](adaptive-learning.md) |
| Work on the Gemini features | [AI features](ai.md) |
| Deploy, configure secrets, read logs, fix common problems | [Operations](operations.md) |
| Run or write tests | [Testing](testing.md) |
| Integrate with the Android container | [Container integration](container.md) |
| Check what data goes where | [Privacy review](privacy/adviser-review.md) |
| Look up a term | [Glossary](../CONTEXT.md) |

## Project rules (from the constitution)

The full text is in [`.specify/memory/constitution.md`](../.specify/memory/constitution.md). In short:

1. **The spreadsheet is the curriculum.** Never invent, fix or drop words, foils, codes or levels. Unconfirmed numbers are *provisional* configuration, never hidden constants.
2. **Child-safe:** encouraging feedback, no punishment, no ads, accounts or chat, and data stays local by default.
3. **Accessible:** large targets, keyboard support, never colour alone, and reduced motion respected.
4. **Offline-first:** play, adaptivity and saving never need the network.
5. **Maintainable:** strict TypeScript; pure, deterministic logic with injected randomness and time; tests for the rules.
6. **Privacy:** AI receives aggregates only, after a recorded review.
7. **Pedagogy first:** patterns need repeated evidence, every decision carries reason codes, and local rules decide.
8. **Bounded AI:** advice is validated against the curriculum, and AI never scores, declares mastery, changes answers or writes questions.

## Specs and tasks

The feature spec, plan and task list are in [`specs/001-spelling-adventure/`](../specs/001-spelling-adventure/). They follow the Spec Kit workflow.
