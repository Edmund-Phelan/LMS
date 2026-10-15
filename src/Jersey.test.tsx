import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import Jersey, { type Kit } from './Jersey'
import teams from './data/teams.json'
// docs/kit-check.html is the reference, drawn by scripts/kit-preview.py.
import ref from '../docs/kit-check.html?raw'

/** Ids differ (slug vs useId); number them in order of appearance. */
function normalise(svg: string) {
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
  for (const [i, id] of ids.entries()) svg = svg.replaceAll(`"${id}"`, `"ID${i}"`).replaceAll(`#${id})`, `#ID${i})`)
  return svg.replace(/ aria-label="[^"]*"/, '').replace(/><\/(rect|path|stop)>/g, '/>')
}

it.each(teams.map((t) => [t.slug, t.kit] as const))('%s matches kit-check.html', (slug, kit) => {
  const want = ref.match(new RegExp(`<svg [^>]*aria-label="${slug} jersey">.*?</svg>`))![0]
  expect(normalise(renderToStaticMarkup(<Jersey kit={kit as Kit} label={slug} />))).toBe(normalise(want))
})
