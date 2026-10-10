/**
 * A small, internally consistent workbook in the spreadsheet's real layout.
 * Tests start from this and break one thing at a time.
 */
import {
  FOIL_CODEBOOK_HEADER,
  LEVEL_GUIDE_HEADER,
  SHEETS,
  WORD_LIST_HEADER,
  type Cell,
} from '../../content/normalize.ts'

type Row = Cell[]

// A type alias (not an interface) so it is assignable to RawWorkbook's index signature.
export type FixtureWorkbook = {
  [SHEETS.wordList]: Row[]
  [SHEETS.levelGuide]: Row[]
  [SHEETS.foilCodebook]: Row[]
  [SHEETS.summary]: Row[]
  [SHEETS.researchBasis]: Row[]
}

const CODEBOOK: Row[] = [
  ['IC', 'Initial-consonant substitution', 'Onset differs.', 'cat > bat', 'First sound', 'Tier 1 (easy)'],
  ['FC', 'Final-consonant substitution', 'Coda differs.', 'cat > cap', 'Last sound', 'Tier 1 (easy)'],
  ['V', 'Vowel substitution', 'Vowel differs.', 'cat > cot', 'Vowel mapping', 'Tier 2'],
  ['PH', 'Pseudohomophone', 'Sounds like target.', 'cake > kake', 'Orthography', 'Tier 4 (hardest)'],
  ['L1-RL', 'L1 transfer: /r/-/l/ confusion', 'r/l swap.', 'red > led', 'L1 interference', 'Tier 2'],
]

const LEVELS: [number, string][] = [
  [1, 'CVC, short vowels'],
  [2, 'Silent-e (CVCe) long vowels'],
]

// [level, item#, seq, target, [foil, code] x3, realWordCount, note]
const ITEMS: [number, number, number, string, [string, string][], number, string | null][] = [
  [1, 1, 1, 'sat', [['sit', 'V'], ['sap', 'FC'], ['hat', 'IC']], 3, null],
  [1, 2, 2, 'red', [['rid', 'V'], ['ret', 'FC'], ['led', 'L1-RL']], 2, null],
  [2, 3, 1, 'cake', [['kake', 'PH'], ['coke', 'V'], ['cave', 'FC']], 2, 'Fixture note.'],
]

const skillOf = (level: number): string => LEVELS.find(([l]) => l === level)?.[1] ?? ''

export function validWorkbook(): FixtureWorkbook {
  const codes = CODEBOOK.map((r) => String(r[0]))
  const wordList: Row[] = [
    [...WORD_LIST_HEADER],
    ...ITEMS.map(([level, item, seq, target, foils, realWord, note]): Row => [
      level,
      item,
      seq,
      skillOf(level),
      target,
      ...foils.flat(),
      realWord,
      foils.filter(([, code]) => code.startsWith('L1-')).length,
      note,
    ]),
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ]

  const countsFor = (level: number | null): number[] =>
    codes.map(
      (code) =>
        ITEMS.filter(([l]) => level === null || l === level)
          .flatMap(([, , , , foils]) => foils)
          .filter(([, c]) => c === code).length,
    )
  const wordsIn = (level: number | null) => ITEMS.filter(([l]) => level === null || l === level).length
  const realWordShare =
    ITEMS.reduce((sum, [, , , , , realWord]) => sum + realWord, 0) / (ITEMS.length * 3)

  return {
    [SHEETS.wordList]: wordList,
    [SHEETS.levelGuide]: [
      [...LEVEL_GUIDE_HEADER],
      ...LEVELS.map(([level, skill]): Row => [level, skill, wordsIn(level), 'Logic.', 'Rationale.']),
      [null, 'Total', ITEMS.length, null, null],
    ],
    [SHEETS.foilCodebook]: [[...FOIL_CODEBOOK_HEADER], ...CODEBOOK.map((r) => [...r])],
    [SHEETS.summary]: [
      ['Level', ...codes, 'Foils in level', 'Check (=3 x words)'],
      ...LEVELS.map(([level]): Row => [level, ...countsFor(level), wordsIn(level) * 3, 'OK']),
      ['Total', ...countsFor(null), ITEMS.length * 3, null],
      ['Counts are foils by type per level.', ...codes.map(() => null), null, null],
      ['Real-word foils (share of all foils)', null, null, realWordShare],
      ['Foils with L1-transfer tag', null, null, 1],
      ['Pseudohomophone foils (PH)', null, null, 1],
    ],
    [SHEETS.researchBasis]: [['Research basis and design notes'], ['Note one.'], [null], ['Note two.']],
  }
}

