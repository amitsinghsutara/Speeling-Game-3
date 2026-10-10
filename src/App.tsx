import { loadContent } from './content/loadContent.ts'

/** Placeholder shell until the game screens land (tasks T018+). */
export function App() {
  const content = loadContent()
  return (
    <main>
      <h1>Spelling Adventure</h1>
      <p>
        {content.items.length} words across {content.levels.length} levels are ready.
      </p>
    </main>
  )
}
