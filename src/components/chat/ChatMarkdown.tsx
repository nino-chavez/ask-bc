'use client';

import type { ReactNode } from 'react';

interface ChatMarkdownProps {
  content: string;
}

function processInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++} style={{ fontWeight: 600, color: '#313440' }}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code key={key++} style={{
          background: '#e8e9ef',
          borderRadius: '3px',
          padding: '0.125rem 0.3rem',
          fontSize: '0.8125rem',
          fontFamily: 'monospace',
        }}>{match[4]}</code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'bullet'; lines: string[] }
  | { type: 'numbered'; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'paragraph'; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const parseRow = (row: string) =>
        row.split('|').map((c) => c.trim()).filter(Boolean);
      const headers = parseRow(tableLines[0]);
      const dataStart = tableLines[1]?.match(/^[\s|:-]+$/) ? 2 : 1;
      const rows = tableLines.slice(dataStart).map(parseRow);
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ''));
        i++;
      }
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'bullet') {
        prev.lines.push(...items);
      } else {
        blocks.push({ type: 'bullet', lines: items });
      }
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'numbered') {
        prev.lines.push(...items);
      } else {
        blocks.push({ type: 'numbered', lines: items });
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty lines
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^#{1,4}\s/) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !(lines[i].includes('|') && lines[i].trim().startsWith('|'))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
  }

  return blocks;
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const blocks = parseBlocks(content);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const fontSize = block.level <= 2 ? '0.9375rem' : '0.875rem';
          return (
            <div key={i} style={{ fontWeight: 600, fontSize, color: '#313440', marginTop: '0.25rem' }}>
              {processInline(block.text)}
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={i} style={{
              background: '#1e1e2e',
              color: '#cdd6f4',
              borderRadius: '6px',
              padding: '0.75rem',
              fontSize: '0.8125rem',
              fontFamily: 'monospace',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {block.text}
            </pre>
          );
        }

        if (block.type === 'bullet') {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc' }}>
              {block.lines.map((line, j) => (
                <li key={j} style={{ marginBottom: '0.25rem' }}>{processInline(line)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'numbered') {
          return (
            <ol key={i} style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {block.lines.map((line, j) => (
                <li key={j} style={{ marginBottom: '0.25rem' }}>{processInline(line)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={i} style={{ overflow: 'auto' }}>
              <table style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: '0.8125rem',
              }}>
                <thead>
                  <tr>
                    {block.headers.map((h, j) => (
                      <th key={j} style={{
                        borderBottom: '2px solid #d9dce9',
                        padding: '0.375rem 0.5rem',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#313440',
                      }}>{processInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k} style={{
                          borderBottom: '1px solid #e8e9ef',
                          padding: '0.375rem 0.5rem',
                        }}>{processInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // paragraph
        return (
          <p key={i} style={{ margin: 0 }}>
            {block.text.split('\n').map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {processInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
