/**
 * Code 128, the symbology the POS scanner reads a member number from. Each
 * symbol is six module widths (three bars and three spaces) summing to eleven;
 * the stop symbol has an extra bar. Values 0 to 102 are data, 103 to 105 the
 * start codes for sets A, B and C, and 106 the stop.
 */
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112'
] as const

const START_B = 104
const START_C = 105
const STOP = 106
/** Modules of clear space either side, which a scanner needs to find the edges. */
const QUIET_ZONE = 10

export function code128Patterns(): readonly string[] {
  return PATTERNS
}

/** Set B covers printable ASCII; set C packs a pair of digits into one symbol. */
export function code128Values(text: string): number[] {
  if (text.length === 0) throw new Error('A barcode needs some text')
  const allDigits = /^\d+$/.test(text)
  const values: number[] = []
  if (allDigits && text.length % 2 === 0) {
    values.push(START_C)
    for (let index = 0; index < text.length; index += 2) {
      values.push(Number(text.slice(index, index + 2)))
    }
  } else {
    values.push(START_B)
    for (const char of text) {
      const code = char.charCodeAt(0)
      if (code < 32 || code > 126) throw new Error(`Cannot encode "${char}" in Code 128 set B`)
      values.push(code - 32)
    }
  }
  const checksum = values.reduce((sum, value, index) => sum + value * Math.max(index, 1), 0)
  values.push(checksum % 103, STOP)
  return values
}

export interface BarcodeBar {
  /** Offset in modules from the left edge, quiet zone included. */
  x: number
  width: number
}

export interface Barcode {
  bars: BarcodeBar[]
  /** Total width in modules, quiet zones included. */
  width: number
}

/** Bars and their positions in module units; the caller picks the module size. */
export function code128Bars(text: string): Barcode {
  const bars: BarcodeBar[] = []
  let x = QUIET_ZONE
  for (const value of code128Values(text)) {
    const pattern = PATTERNS[value]
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index])
      if (index % 2 === 0) bars.push({ x, width })
      x += width
    }
  }
  return { bars, width: x + QUIET_ZONE }
}

export interface BarcodeSvgOptions {
  /** Height of the bars in the SVG's units. */
  height: number
  /** Width of one module in the SVG's units. */
  module: number
}

function escapeAttribute(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** An SVG of the barcode, sized in whatever unit the surrounding page uses. */
export function code128Svg(text: string, options: BarcodeSvgOptions): string {
  const { bars, width } = code128Bars(text)
  const totalWidth = width * options.module
  const rects = bars
    .map(
      (bar) =>
        `<rect x="${bar.x * options.module}" y="0" width="${bar.width * options.module}" height="${options.height}"/>`
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${options.height}" width="${totalWidth}" height="${options.height}" role="img" aria-label="${escapeAttribute(text)}" shape-rendering="crispEdges">${rects}</svg>`
}
