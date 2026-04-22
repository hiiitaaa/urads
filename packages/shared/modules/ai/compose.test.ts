import { describe, it, expect } from 'vitest';
import { composeSkillPrompt, extractJson, stripFrontmatter } from './compose.js';

describe('composeSkillPrompt', () => {
  it('embeds skill name, body, and input JSON', () => {
    const out = composeSkillPrompt('buzz-rewrite', '本体です', { foo: 'bar' });
    expect(out).toContain('「buzz-rewrite」');
    expect(out).toContain('本体です');
    expect(out).toContain('"foo": "bar"');
    expect(out).toContain('```json');
  });

  it('handles string input (JSON-stringified)', () => {
    const out = composeSkillPrompt('x', 'body', 'plain-string');
    expect(out).toContain('"plain-string"');
  });

  it('handles null input', () => {
    const out = composeSkillPrompt('x', 'body', null);
    expect(out).toContain('null');
  });

  it('trims skill body whitespace', () => {
    const out = composeSkillPrompt('x', '\n\n本文\n\n', {});
    expect(out).toContain('\n\n本文\n\n---'); // trimmed body then separator
    expect(out).not.toMatch(/\n{5,}/);
  });
});

describe('extractJson', () => {
  it('returns null for empty input', () => {
    expect(extractJson('')).toBeNull();
  });

  it('extracts from ```json fence', () => {
    const raw = 'はい、以下です\n```json\n{"a":1}\n```\n以上';
    expect(extractJson(raw)).toEqual({ a: 1 });
  });

  it('extracts from ``` fence without lang', () => {
    const raw = '```\n{"b":2}\n```';
    expect(extractJson(raw)).toEqual({ b: 2 });
  });

  it('prefers first ```json fence over later ``` fence', () => {
    const raw = '```json\n{"first":true}\n```\n\n```\n{"second":true}\n```';
    expect(extractJson(raw)).toEqual({ first: true });
  });

  it('falls back to bare object when no fence', () => {
    const raw = 'hello {"c":3} world';
    expect(extractJson(raw)).toEqual({ c: 3 });
  });

  it('falls back to bare array when no object', () => {
    const raw = 'text [1,2,3] text';
    expect(extractJson(raw)).toEqual([1, 2, 3]);
  });

  it('ignores braces inside string literals', () => {
    const raw = '{"msg":"{}","n":1}';
    expect(extractJson(raw)).toEqual({ msg: '{}', n: 1 });
  });

  it('returns null for invalid JSON in fence', () => {
    const raw = '```json\nnot json\n```';
    expect(extractJson(raw)).toBeNull();
  });

  it('handles nested objects', () => {
    const raw = '```json\n{"a":{"b":{"c":1}}}\n```';
    expect(extractJson(raw)).toEqual({ a: { b: { c: 1 } } });
  });

  it('handles variant JSON with escaped quotes', () => {
    const raw = '{"quoted":"she said \\"hi\\"","x":1}';
    expect(extractJson(raw)).toEqual({ quoted: 'she said "hi"', x: 1 });
  });
});

describe('stripFrontmatter', () => {
  it('removes YAML frontmatter', () => {
    const md = '---\nname: foo\ndescription: bar\n---\n本文';
    expect(stripFrontmatter(md)).toBe('本文');
  });

  it('returns unchanged when no frontmatter', () => {
    expect(stripFrontmatter('# タイトル\n本文')).toBe('# タイトル\n本文');
  });

  it('handles multiline frontmatter values', () => {
    const md = '---\nname: x\ndescription: |\n  a\n  b\n---\nbody';
    expect(stripFrontmatter(md)).toBe('body');
  });
});
