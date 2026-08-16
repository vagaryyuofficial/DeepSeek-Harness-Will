import { writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const SIZE = 512
const RADIUS = 112
const POINTS = [[92, 142], [166, 372], [256, 198], [346, 372], [420, 142]]

function color(hex) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
}

function mix(left, right, amount) {
  return left.map((value, index) => Math.round(value + (right[index] - value) * amount))
}

function inRoundedRect(x, y) {
  if ((x >= RADIUS && x <= SIZE - RADIUS) || (y >= RADIUS && y <= SIZE - RADIUS)) return true
  const cornerX = x < RADIUS ? RADIUS : SIZE - RADIUS
  const cornerY = y < RADIUS ? RADIUS : SIZE - RADIUS
  return Math.hypot(x - cornerX, y - cornerY) <= RADIUS
}

function distanceToSegment(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const denominator = dx * dx + dy * dy
  const amount = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / denominator))
  return Math.hypot(x - (x1 + amount * dx), y - (y1 + amount * dy))
}

function sample(x, y) {
  if (!inRoundedRect(x, y)) return [0, 0, 0, 0]
  let pixel = [...mix(color('#071827'), color('#123d59'), Math.min(1, (x + y) / (SIZE * 2))), 255]
  for (let index = 1; index < POINTS.length; index += 1) {
    if (distanceToSegment(x, y, POINTS[index - 1], POINTS[index]) <= 21) {
      pixel = [...mix(color('#5ce1e6'), color('#7cf6bd'), x / SIZE), 255]
      break
    }
  }
  for (const [nodeX, nodeY] of POINTS) {
    const distance = Math.hypot(x - nodeX, y - nodeY)
    if (distance <= 29) pixel = [...color('#1e6d7e'), 255]
    if (distance <= 24) pixel = [...color('#eaffff'), 255]
  }
  return pixel
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const output = Buffer.alloc(12 + data.length)
  output.writeUInt32BE(data.length, 0)
  name.copy(output, 4)
  data.copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length)
  return output
}

const pixels = Buffer.alloc((SIZE * 4 + 1) * SIZE)
const offsets = [0.25, 0.75]
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (SIZE * 4 + 1)
  pixels[row] = 0
  for (let x = 0; x < SIZE; x += 1) {
    const total = [0, 0, 0, 0]
    for (const offsetY of offsets) for (const offsetX of offsets) {
      const value = sample(x + offsetX, y + offsetY)
      for (let channel = 0; channel < 4; channel += 1) total[channel] += value[channel]
    }
    const start = row + 1 + x * 4
    for (let channel = 0; channel < 4; channel += 1) pixels[start + channel] = Math.round(total[channel] / 4)
  }
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8
header[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
await writeFile(fileURLToPath(new URL('../assets/icon.png', import.meta.url)), png)
