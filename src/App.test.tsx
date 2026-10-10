import { render, screen } from '@testing-library/react'
import { App } from './App.tsx'

it('renders the content summary', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Spelling Adventure' })).toBeInTheDocument()
  expect(screen.getByText(/200 words across 10 levels/)).toBeInTheDocument()
})
