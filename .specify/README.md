# Spelling Adventure — Spec Kit Starter

This is a starter specification pack for rebuilding the forest-themed Spelling Adventure game from scratch using GitHub Spec Kit and an AI coding agent.

## How to use

1. Copy the contents into your game's repository.
2. Review `constitution.md` and adjust any project-wide rules.
3. Run the Spec Kit commands supported by your installation/agent:
   - `/speckit.constitution` — use the principles in `constitution.md`
   - `/speckit.specify` — use `specs/001-spelling-adventure/spec.md`
   - `/speckit.clarify` — resolve the open questions in the spec
   - `/speckit.plan` — use `specs/001-spelling-adventure/plan.md` as the initial technical direction
   - `/speckit.tasks` — generate/refine tasks using `specs/001-spelling-adventure/tasks.md`
   - `/speckit.implement` — implement in small, reviewable increments

   Exact command names and artifact locations can vary by Spec Kit version and agent. If a command is unavailable, use the corresponding document as input to your agent.

4. Keep the supplied word spreadsheet as the source of truth. Import the complete spreadsheet before implementing the full game; the examples in this pack are illustrative only.
5. Implement one milestone at a time. Run tests and inspect the app before proceeding.

## Assumptions in this starter

- First target: responsive web game/PWA.
- Tech stack: React + TypeScript + Vite.
- Offline play and local progress are requirements.
- Audio uses a replaceable abstraction: bundled recordings are preferred for consistent production pronunciation; browser speech synthesis is a best-effort fallback where supported. An Android WebView native TTS bridge is optional and must be detected by capability, not by user-agent alone.
- The visual direction is a friendly forest adventure with Fern the fox, wooden sign-style panels, clear answer tiles, and gentle celebratory feedback.
- No online AI service is required for core gameplay.

If Android CR Container integration is required, add it as a separate feature/spec after the browser version's interface contracts are agreed.
