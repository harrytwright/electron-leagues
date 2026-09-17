import { describe, expect, it } from 'vitest'
import { parseFrontmatterFields, parseHelpFrontmatter } from '../frontmatter'

const valid = [
  'title: Seasons',
  'description: Naming rules and the wizard.',
  'section: Working with leagues',
  'order: 2',
  'status: draft',
  'updated: 2026-09-17',
  'version: 0.2.3'
].join('\n')

describe('parseFrontmatterFields', () => {
  it('splits flat key and value lines and keeps colons inside values', () => {
    expect(parseFrontmatterFields('title: Seasons: the guide\n\nstatus: draft\n')).toEqual([
      { key: 'title', value: 'Seasons: the guide' },
      { key: 'status', value: 'draft' }
    ])
  })

  it('rejects a line without a separator and a repeated key', () => {
    expect(() => parseFrontmatterFields('title Seasons')).toThrow(/not "key: value"/)
    expect(() => parseFrontmatterFields('title: A\ntitle: B')).toThrow(/Duplicate frontmatter key/)
  })
})

describe('parseHelpFrontmatter', () => {
  it('coerces order to a number and accepts every documented field', () => {
    expect(parseHelpFrontmatter(valid)).toEqual({
      title: 'Seasons',
      description: 'Naming rules and the wizard.',
      section: 'Working with leagues',
      order: 2,
      status: 'draft',
      updated: '2026-09-17',
      version: '0.2.3'
    })
  })

  it.each([
    ['section: Appendix', /section/],
    ['status: published', /status/],
    ['order: first', /order/],
    ['updated: yesterday', /updated/],
    ['version: v1', /version/]
  ])('rejects %s', (override, field) => {
    const key = override.slice(0, override.indexOf(':'))
    const source = valid
      .split('\n')
      .map((line) => (line.startsWith(`${key}:`) ? override : line))
      .join('\n')
    expect(() => parseHelpFrontmatter(source)).toThrow(field)
  })

  it('rejects a missing field', () => {
    const source = valid.split('\n').slice(1).join('\n')
    expect(() => parseHelpFrontmatter(source)).toThrow(/title/)
  })
})
