import type { ReactNode } from 'react'

// Minimální Markdown pro odpovědi poradce: nadpisy, odrážky, číslované body, **tučně**, *kurzíva*, `kód`.
// Vše přes React elementy – žádné vkládání HTML.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    list = null
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const heading = line.match(/^#{1,4}\s+(.*)/)
    const bullet = line.match(/^\s*[-*•]\s+(.*)/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/)
    if (!line.trim()) {
      flushPara()
      flushList()
    } else if (heading) {
      flushPara()
      flushList()
      blocks.push(<h4 key={blocks.length}>{inline(heading[1])}</h4>)
    } else if (bullet || numbered) {
      flushPara()
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ' ' + line.trim() // pokračování bodu na dalším řádku
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="markdown">{blocks}</div>
}
