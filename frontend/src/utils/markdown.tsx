import React from 'react';

/**
 * Render a subset of Markdown as React elements: headers, bold, italic, code,
 * bullet/numbered lists, horizontal rules, and paragraphs.
 * Used for AI-generated text (coach reports, chat, setup advice reviews).
 */
export function renderFormattedMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`ul-${elements.length}`} className="space-y-1.5 my-2">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-brand font-bold mt-0.5">•</span>
                <span className="flex-1 leading-relaxed text-xs">{item}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} className="space-y-1.5 my-2">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold font-telemetry text-xs mt-0.5">{idx + 1}.</span>
                <span className="flex-1 leading-relaxed text-xs">{item}</span>
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  const formatInline = (str: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIdx) {
        parts.push(str.substring(lastIdx, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="text-white font-bold font-sans">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={match.index}
            className="font-mono text-brand bg-white/10 px-1 py-0.5 rounded text-[11px]"
          >
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(
          <em key={match.index} className="text-gray-200 italic">
            {token.slice(1, -1)}
          </em>
        );
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < str.length) {
      parts.push(str.substring(lastIdx));
    }
    return parts;
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    // Markdown Headers
    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <h5 key={`h5-${lineIdx}`} className="text-[11px] font-bold text-brand uppercase tracking-wider mt-2.5 mb-0.5 font-telemetry">
          {formatInline(trimmed.substring(5))}
        </h5>
      );
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h4-${lineIdx}`} className="text-xs font-bold text-brand uppercase tracking-wider mt-3 mb-1 font-telemetry">
          {formatInline(trimmed.substring(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${lineIdx}`} className="text-sm font-bold text-white uppercase tracking-wider mt-4 mb-1.5 font-telemetry border-b border-white/10 pb-1">
          {formatInline(trimmed.substring(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${lineIdx}`} className="text-base font-bold text-white uppercase tracking-wider mt-4 mb-2 font-telemetry">
          {formatInline(trimmed.substring(2))}
        </h2>
      );
      return;
    }
    if (trimmed === '---' || trimmed === '***') {
      flushList();
      elements.push(<hr key={`hr-${lineIdx}`} className="border-white/10 my-2.5" />);
      return;
    }

    // Bullet list: * or -
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(formatInline(trimmed.substring(2)));
      return;
    }

    // Numbered list: 1. 2.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(formatInline(numMatch[2]));
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${lineIdx}`} className="leading-relaxed my-1 text-xs text-gray-300">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-1">{elements}</div>;
}
