import { describe, expect, test } from 'vitest'
import { code128Bars, code128Patterns, code128Svg, code128Values } from '../code128'

describe('code128', () => {
  test('every symbol is three bars and three spaces eleven modules wide, and the stop is thirteen', () => {
    const patterns = code128Patterns()
    expect(patterns).toHaveLength(107)
    patterns.slice(0, 106).forEach((pattern) => {
      expect(pattern).toHaveLength(6)
      expect([...pattern].reduce((sum, width) => sum + Number(width), 0)).toBe(11)
    })
    expect(patterns[106]).toBe('2331112')
    expect(patterns[104]).toBe('211214')
  })

  test('packs an even run of digits into set C with the standard checksum', () => {
    // Start C (105) + 12·1 + 34·2 + 56·3 = 353, and 353 mod 103 = 44.
    expect(code128Values('123456')).toEqual([105, 12, 34, 56, 44, 106])
  })

  test('falls back to set B for text and odd digit runs', () => {
    // Start B (104) + ('A' − 32)·1 = 137, and 137 mod 103 = 34.
    expect(code128Values('A')).toEqual([104, 33, 34, 106])
    expect(code128Values('12345')[0]).toBe(104)
    expect(() => code128Values('')).toThrow('needs some text')
    expect(() => code128Values('é')).toThrow('Cannot encode')
  })

  test('lays the bars out with quiet zones and sizes the SVG from the module width', () => {
    const { bars, width } = code128Bars('123456')
    // 10 quiet + 5 symbols × 11 + 13 stop + 10 quiet.
    expect(width).toBe(10 + 5 * 11 + 13 + 10)
    expect(bars[0]).toEqual({ x: 10, width: 2 })
    expect(bars.at(-1)).toEqual({ x: width - 10 - 2, width: 2 })

    const svg = code128Svg('123456', { height: 12, module: 0.3 })
    expect(svg).toContain(`viewBox="0 0 ${width * 0.3} 12"`)
    expect(svg).toContain('aria-label="123456"')
    expect(code128Svg('A"<B', { height: 1, module: 1 })).toContain('aria-label="A&quot;&lt;B"')
    expect(svg.match(/<rect /g)).toHaveLength(bars.length)
  })
})
