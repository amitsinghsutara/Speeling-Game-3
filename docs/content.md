# Content pipeline

The authoritative curriculum is `English_Spelling_Words_and_Foils.xlsx` at the repository root. The game never edits it: an import script turns it into a validated, versioned JSON file that ships with the app.

```bash
npm run gen:content              # xlsx -> src/content/content.generated.json
npm run gen:content -- --check   # fail if the committed JSON is out of date (part of npm run check)
```

## Sheets

| Sheet | Used for |
|---|---|
| **WordList** | 200 items: level, item number, sequence in level, skill pattern, target, 3 foils with codes, real-word and L1-transfer counts, design note |
| **LevelGuide** | 10 levels: skill pattern, target-word count, foil design logic, research rationale |
| **FoilCodebook** | 18 codes: name, definition, example, what it probes, difficulty tier |
| **Summary** | Not shipped. Used only to cross-check the WordList counts. |
| **ResearchBasis** | Shipped as developer-facing notes; never shown to children |

## What the import checks

The import fails, and writes nothing, if any of these happen:

- **Shape:** a sheet is missing, or a header has moved or been renamed.
- **Missing or malformed values:** a required cell is empty, or a whole-number field isn't one.
- **Words:** not lowercase `a–z`.
- **Foil codes:** a code is not in the codebook.
- **Duplicates:** an item number appears twice, or two choices in an item are the same.
- **Sequences:** gaps or repeats in a level's sequence numbers.
- **LevelGuide counts:** a level's word count, or the total, differs from the LevelGuide.
- **L1-transfer counts:** a row's count disagrees with its `L1-` codes.
- **Summary sheet:** per-level or total foil-type tallies, the real-word share, the L1-tagged count or the pseudohomophone count disagree with the WordList.

A target word appearing twice is a **warning**, not an error.

Every problem is reported with its sheet, row and field.

## The generated dataset

`src/content/content.generated.json` contains:

- `schemaVersion`
- `contentVersion`: a SHA-256 of levels, codebook and items, stored on every learning event
- `source`: file name and SHA-256
- `levels`, `foilCodebook` and `items`, with stable `item-NNN` ids and source rows
- `researchNotes`

The app re-validates it on load (`src/content/loadContent.ts`).

## Changing the curriculum

1. Edit the spreadsheet: words, foils, codes and Summary together.
2. Run `npm run gen:content` and fix anything it reports.
3. Check every new **target** word has audio: `public/audio/words/<target>.mp3`. A test fails if one is missing, or if an MP3 has no matching target.
4. Run `npm run check`, then commit the spreadsheet and the generated JSON together.

Stored learning events keep their `contentVersion`. The learner model ignores events for items that no longer exist.

## Facts worth knowing

- **Duplicate codes:** 12 items have two foils with the same code (for example `grow`: `gro` PH, `groe` PH). That's why decisions store foil **words**, not just codes.
- **L1-transfer foils:** these (`L1-*`) are served as listed. The spreadsheet does not include the "general" alternatives they replace, so nothing is swapped.
- **Draft data:** the spreadsheet calls itself an unpiloted, research-informed draft, and assumes General American pronunciation.
