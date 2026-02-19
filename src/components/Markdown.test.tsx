import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from './Markdown';

describe('MarkdownRenderer', () => {
  it('renders plain text inside a paragraph', () => {
    render(<MarkdownRenderer>{'Hello world'}</MarkdownRenderer>);
    const el = screen.getByText('Hello world');
    expect(el.tagName).toBe('P');
  });

  it('renders bold text', () => {
    render(<MarkdownRenderer>{'This is **bold** text'}</MarkdownRenderer>);
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
    expect(bold.className).toContain('font-bold');
  });

  it('renders italic text', () => {
    render(<MarkdownRenderer>{'This is *italic* text'}</MarkdownRenderer>);
    const italic = screen.getByText('italic');
    expect(italic.tagName).toBe('EM');
  });

  it('renders inline code', () => {
    render(<MarkdownRenderer>{'Use `kubectl` command'}</MarkdownRenderer>);
    const code = screen.getByText('kubectl');
    expect(code.tagName).toBe('CODE');
    expect(code.className).toContain('font-mono');
  });

  it('renders unordered lists', () => {
    render(<MarkdownRenderer>{'- Item one\n- Item two'}</MarkdownRenderer>);
    expect(screen.getByText('Item one')).toBeInTheDocument();
    expect(screen.getByText('Item two')).toBeInTheDocument();
    const list = screen.getByText('Item one').closest('ul');
    expect(list).toBeTruthy();
    expect(list!.className).toContain('list-disc');
  });

  it('renders ordered lists', () => {
    render(<MarkdownRenderer>{'1. First\n2. Second'}</MarkdownRenderer>);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    const list = screen.getByText('First').closest('ol');
    expect(list).toBeTruthy();
    expect(list!.className).toContain('list-decimal');
  });

  it('renders headings', () => {
    render(<MarkdownRenderer>{'# Title\n## Subtitle'}</MarkdownRenderer>);
    const h1 = screen.getByText('Title');
    expect(h1.tagName).toBe('H1');
    const h2 = screen.getByText('Subtitle');
    expect(h2.tagName).toBe('H2');
  });

  it('renders links with target _blank', () => {
    render(<MarkdownRenderer>{'[Click here](https://example.com)'}</MarkdownRenderer>);
    const link = screen.getByText('Click here');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('href')).toBe('https://example.com');
  });

  it('renders blockquotes', () => {
    render(<MarkdownRenderer>{'> This is a quote'}</MarkdownRenderer>);
    const quote = screen.getByText('This is a quote').closest('blockquote');
    expect(quote).toBeTruthy();
    expect(quote!.className).toContain('border-l-2');
  });

  it('renders code blocks', () => {
    const codeBlock = '```\nconst x = 1;\n```';
    render(<MarkdownRenderer>{codeBlock}</MarkdownRenderer>);
    const pre = screen.getByText('const x = 1;').closest('pre');
    expect(pre).toBeTruthy();
    expect(pre!.className).toContain('overflow-x-auto');
  });
});
