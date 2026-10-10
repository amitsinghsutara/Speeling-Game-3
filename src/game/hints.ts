/**
 * Short, child-facing hints shown after a wrong choice, keyed by FoilCodebook
 * code. The wording is ported from Speeling Game 2; codes themselves are never
 * shown to the child. A code without a hint falls back to a gentle default.
 */
const HINTS: Readonly<Record<string, string>> = {
  IC: 'Listen to the first sound.',
  FC: 'Listen to the last sound.',
  V: 'Listen to the middle sound.',
  VIS: 'Look closely at the letter shapes.',
  OM: 'Listen carefully. You might be missing a sound.',
  DIG: 'Listen closely. Two letters team up to make that sound.',
  TR: 'Check the order of the letters.',
  PH: 'That sounds right, but it is spelled another way. Look again!',
  REG: 'This word is a little different. It does not follow the usual pattern.',
  OVR: 'Check the spelling pattern carefully.',
  DBL: 'Check if a letter should appear twice.',
  INS: 'Listen carefully. There might be an extra sound.',
  'L1-RL': 'Listen closely. Is it r or l?',
  'L1-VD': 'Listen closely to the last sound.',
  'L1-PRO': 'Listen. The word does not start with an extra sound.',
  'L1-EPN': 'Listen. There is no extra sound in the middle.',
  'L1-TH': "Listen closely to the 'th' sound.",
  'L1-VOW': 'Listen closely to the vowel sound.',
}

export const DEFAULT_HINT = 'Listen again and try once more.'

export const hintFor = (foilCode: string | undefined): string =>
  (foilCode !== undefined ? HINTS[foilCode] : undefined) ?? DEFAULT_HINT

export const hasHint = (foilCode: string): boolean => foilCode in HINTS
