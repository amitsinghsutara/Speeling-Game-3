import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AnswerGrid, LONG_WORD_LETTERS } from './Play.tsx'

const grid = () => screen.getByRole('group', { name: /choose the spelling/i })
const choices = (words: string[]) => words.map((word, i) => ({ word, isTarget: i === 0 }))

it('sizes every tile from the longest word, so text size never hints at the answer', () => {
  render(<AnswerGrid choices={choices(['beautiful', 'butiful', 'beautifull', 'beutiful'])} stateOf={() => 'idle'} onChoose={() => {}} />)
  expect(grid().style.getPropertyValue('--letters')).toBe('10')
  for (const tile of screen.getAllByRole('button')) {
    expect(tile.querySelector('span')?.style.getPropertyValue('--letters')).toBe('')
  }
})

it('marks questions with long words so narrow phones can stack the tiles', () => {
  const { rerender } = render(<AnswerGrid choices={choices(['sat', 'sit', 'sap', 'hat'])} stateOf={() => 'idle'} onChoose={() => {}} />)
  expect(grid().className).not.toMatch(/long/)
  const long = 'x'.repeat(LONG_WORD_LETTERS)
  rerender(<AnswerGrid choices={choices([long, 'sit', 'sap', 'hat'])} stateOf={() => 'idle'} onChoose={() => {}} />)
  expect(grid().className).toMatch(/long/)
})
