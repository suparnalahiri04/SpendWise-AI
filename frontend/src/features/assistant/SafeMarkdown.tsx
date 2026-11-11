import type { ReactNode } from 'react'

interface SafeMarkdownProps {
  content: string
  className?: string
}

type SubBlock =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

/**
 * Safely parses and renders Markdown text without dangerouslySetInnerHTML.
 * Supports headings (# through ####), paragraphs, bullet lists, numbered lists,
 * bold text, and inline code.
 * Correctly extracts lists and headings even when preceded by single-newline text.
 */
export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  if (!content) return null

  // Split content into blocks separated by blank lines
  const blocks = content.trim().split(/\n\s*\n/)

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => {
        const rawLines = block.split('\n').map((line) => line.trim())
        // Partition lines into consecutive sub-blocks (headings, paragraphs, unordered lists, ordered lists)
        const subBlocks: SubBlock[] = []

        for (const line of rawLines) {
          if (!line) continue

          if (/^####\s+/.test(line)) {
            subBlocks.push({ type: 'h4', text: line.replace(/^####\s+/, '') })
          } else if (/^###\s+/.test(line)) {
            subBlocks.push({ type: 'h3', text: line.replace(/^###\s+/, '') })
          } else if (/^##\s+/.test(line)) {
            subBlocks.push({ type: 'h2', text: line.replace(/^##\s+/, '') })
          } else if (/^#\s+/.test(line)) {
            subBlocks.push({ type: 'h1', text: line.replace(/^#\s+/, '') })
          } else if (/^[-*]\s+/.test(line)) {
            const item = line.replace(/^[-*]\s+/, '')
            const last = subBlocks[subBlocks.length - 1]
            if (last && last.type === 'ul') {
              last.items.push(item)
            } else {
              subBlocks.push({ type: 'ul', items: [item] })
            }
          } else if (/^\d+\.\s+/.test(line)) {
            const item = line.replace(/^\d+\.\s+/, '')
            const last = subBlocks[subBlocks.length - 1]
            if (last && last.type === 'ol') {
              last.items.push(item)
            } else {
              subBlocks.push({ type: 'ol', items: [item] })
            }
          } else {
            const last = subBlocks[subBlocks.length - 1]
            if (last && last.type === 'p') {
              last.lines.push(line)
            } else {
              subBlocks.push({ type: 'p', lines: [line] })
            }
          }
        }

        return (
          <div key={blockIndex} className="space-y-2">
            {subBlocks.map((sub, subIndex) => {
              if (sub.type === 'h1') {
                return (
                  <h1 key={subIndex} className="my-2.5 text-lg font-bold text-ink">
                    {renderInline(sub.text)}
                  </h1>
                )
              }
              if (sub.type === 'h2') {
                return (
                  <h2 key={subIndex} className="my-2 text-base font-bold text-ink">
                    {renderInline(sub.text)}
                  </h2>
                )
              }
              if (sub.type === 'h3') {
                return (
                  <h3 key={subIndex} className="my-2 text-sm font-semibold text-ink">
                    {renderInline(sub.text)}
                  </h3>
                )
              }
              if (sub.type === 'h4') {
                return (
                  <h4 key={subIndex} className="my-1.5 text-xs font-semibold text-ink">
                    {renderInline(sub.text)}
                  </h4>
                )
              }
              if (sub.type === 'ul') {
                return (
                  <ul key={subIndex} className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                    {sub.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{renderInline(item)}</li>
                    ))}
                  </ul>
                )
              }
              if (sub.type === 'ol') {
                return (
                  <ol key={subIndex} className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
                    {sub.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{renderInline(item)}</li>
                    ))}
                  </ol>
                )
              }
              return (
                <p key={subIndex} className="my-2 text-sm leading-relaxed first:mt-0 last:mb-0">
                  {sub.lines.map((line, lineIndex) => (
                    <span key={lineIndex}>
                      {renderInline(line)}
                      {lineIndex < sub.lines.length - 1 && ' '}
                      {lineIndex < sub.lines.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Safely converts bold (**text**) and inline code (`code`) into React elements.
 */
function renderInline(text: string): ReactNode[] {
  // Regex to split on **bold** and `code`
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-ink"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

