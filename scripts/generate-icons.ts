/**
 * Dependency-free PWA icon generator: draws Fern's face (the same shapes as
 * src/ui/components/Mascot.tsx, "happy" mood) to pixels and writes real PNGs
 * using only Node's zlib. No canvas or image libraries to install.
 *
 *   node scripts/generate-icons.ts
 *
 * Writes public/icons/icon-192.png, icon-512.png, maskable-icon-512.png and public/favicon.svg.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

type RGB = readonly [number, number, number]
type Point = readonly [number, number]

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const INK = hex('#2b1a0e')
const SKY = hex('#8fdcff')
const FUR = hex('#ff9a3c')
const EAR = hex('#ffe3c4')
const MUZZLE = hex('#fff4e6')
const BLUSH = hex('#ff9ec0')
const WHITE = hex('#ffffff')

/** A layer answers "is this design-space point inside me?" (design space is Fern's 200x200 viewBox). */
interface Layer {
  color: RGB
  inside: (x: number, y: number) => boolean
}

const ellipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r)

function distToSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function inTriangle(px: number, py: number, a: Point, b: Point, c: Point): boolean {
  const side = (p: Point, q: Point) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0])
  const s1 = side(a, b)
  const s2 = side(b, c)
  const s3 = side(c, a)
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
}

/** A triangle grown by `grow` units on every side (used for the ink outline). */
const triangle = (a: Point, b: Point, c: Point, grow = 0) => (x: number, y: number) =>
  inTriangle(x, y, a, b, c) ||
  (grow > 0 && Math.min(distToSegment(x, y, a, b), distToSegment(x, y, b, c), distToSegment(x, y, c, a)) <= grow)

/** A quadratic Bézier drawn as a round-capped stroke. */
function curve(from: Point, control: Point, to: Point, width: number) {
  const points: Point[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const u = 1 - t
    points.push([u * u * from[0] + 2 * u * t * control[0] + t * t * to[0], u * u * from[1] + 2 * u * t * control[1] + t * t * to[1]])
  }
  return (x: number, y: number) => points.some((p, i) => i > 0 && distToSegment(x, y, points[i - 1] ?? p, p) <= width / 2)
}

const mirror = (p: Point): Point => [200 - p[0], p[1]]
const earL: [Point, Point, Point] = [[50, 60], [30, 10], [85, 55]]
const earInnerL: [Point, Point, Point] = [[55, 52], [42, 24], [78, 50]]
const earR = earL.map(mirror) as [Point, Point, Point]
const earInnerR = earInnerL.map(mirror) as [Point, Point, Point]
const OUTLINE = 3.5
const EYE = 1.1 // the "happy" mood's eye scale, around (100, 98)
const eye = (x: number) => 100 + (x - 100) * EYE

const FERN: Layer[] = [
  // Ink outlines first, then fills on top: this gives the cartoon line around every shape.
  { color: INK, inside: triangle(...earL, OUTLINE) },
  { color: INK, inside: triangle(...earR, OUTLINE) },
  { color: INK, inside: ellipse(100, 105, 72 + OUTLINE, 66 + OUTLINE) },
  { color: FUR, inside: triangle(...earL) },
  { color: FUR, inside: triangle(...earR) },
  { color: FUR, inside: ellipse(100, 105, 72, 66) },
  { color: EAR, inside: triangle(...earInnerL) },
  { color: EAR, inside: triangle(...earInnerR) },
  { color: MUZZLE, inside: ellipse(100, 130, 38, 27) },
  { color: BLUSH, inside: ellipse(50, 120, 13, 9) },
  { color: BLUSH, inside: ellipse(150, 120, 13, 9) },
  { color: INK, inside: curve([64, 74], [76, 68], [88, 74], 4.5) },
  { color: INK, inside: curve([112, 74], [124, 68], [136, 74], 4.5) },
  { color: INK, inside: circle(eye(76), 98, (12 + 2) * EYE) },
  { color: INK, inside: circle(eye(124), 98, (12 + 2) * EYE) },
  { color: WHITE, inside: circle(eye(76), 98, 12 * EYE) },
  { color: WHITE, inside: circle(eye(124), 98, 12 * EYE) },
  { color: INK, inside: circle(eye(76), 99, 7.5 * EYE) },
  { color: INK, inside: circle(eye(124), 99, 7.5 * EYE) },
  { color: WHITE, inside: circle(eye(79.5), 95.5, 2.8 * EYE) },
  { color: WHITE, inside: circle(eye(127.5), 95.5, 2.8 * EYE) },
  { color: INK, inside: ellipse(100, 121, 8, 5.5) },
  { color: INK, inside: curve([80, 134], [100, 158], [120, 134], 5) },
]

/**
 * Renders one RGBA icon with 4x4 supersampling for smooth edges.
 * `maskable` fills edge to edge and keeps Fern inside the 80% safe zone.
 */
function render(size: number, maskable: boolean): Buffer {
  const pixels = Buffer.alloc(size * size * 4)
  const SS = 4
  // Map pixels to design space: Fern (about 160 units tall) is centred in the icon.
  const fernSize = maskable ? 0.62 : 0.8
  const scale = 200 / (size * fernSize)
  const offset = (size - size * fernSize) / 2
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS
          const y = py + (sy + 0.5) / SS
          const inBackground = maskable || Math.hypot(x - size / 2, y - size / 2) <= size / 2
          const dx = (x - offset) * scale
          const dy = (y - offset) * scale + 8 // nudge down: ears make Fern top-heavy
          let color: RGB | null = inBackground ? SKY : null
          for (const layer of FERN) if (layer.inside(dx, dy)) color = layer.color
          if (color) {
            r += color[0]
            g += color[1]
            b += color[2]
            a += 1
          }
        }
      }
      const i = (py * size + px) * 4
      const n = SS * SS
      if (a > 0) {
        pixels[i] = Math.round(r / a)
        pixels[i + 1] = Math.round(g / a)
        pixels[i + 2] = Math.round(b / a)
      }
      pixels[i + 3] = Math.round((a / n) * 255)
    }
  }
  return pixels
}

function png(size: number, rgba: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(8, 8) // bit depth
  header.writeUInt8(6, 9) // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="100" fill="#8fdcff"/>
  <g transform="translate(20 28) scale(0.8)" stroke="#2b1a0e" stroke-linejoin="round" stroke-linecap="round">
    <path d="M50 60 L30 10 L85 55 Z M150 60 L170 10 L115 55 Z" fill="#ff9a3c" stroke-width="7"/>
    <ellipse cx="100" cy="105" rx="72" ry="66" fill="#ff9a3c" stroke-width="7"/>
    <path d="M55 52 L42 24 L78 50 Z M145 52 L158 24 L122 50 Z" fill="#ffe3c4" stroke="none"/>
    <ellipse cx="100" cy="130" rx="38" ry="27" fill="#fff4e6" stroke="none"/>
    <circle cx="74" cy="98" r="13" fill="#fff" stroke-width="4"/>
    <circle cx="126" cy="98" r="13" fill="#fff" stroke-width="4"/>
    <circle cx="74" cy="99" r="8" fill="#2b1a0e" stroke="none"/>
    <circle cx="126" cy="99" r="8" fill="#2b1a0e" stroke="none"/>
    <ellipse cx="100" cy="121" rx="8" ry="5.5" fill="#2b1a0e" stroke="none"/>
    <path d="M80 134 Q100 158 120 134" fill="none" stroke-width="5"/>
  </g>
</svg>
`

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = resolve(ROOT, 'public/icons')
mkdirSync(ICONS, { recursive: true })
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-icon-512.png', 512, true],
] as const) {
  writeFileSync(resolve(ICONS, name), png(size, render(size, maskable)))
  console.log(`Wrote public/icons/${name}`)
}
writeFileSync(resolve(ROOT, 'public/favicon.svg'), FAVICON)
console.log('Wrote public/favicon.svg')
