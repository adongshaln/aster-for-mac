import { diffLines } from 'diff'

export interface DiffRow {
  type: 'context' | 'add' | 'del'
  oldNum?: number
  newNum?: number
  text: string
}

/** Align unchanged lines across insertions and removals. */
export function buildLineDiff(oldText: string, newText: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNum = 1
  let newNum = 1
  for (const part of diffLines(oldText, newText)) {
    const lines = part.value.split('\n')
    if (lines.at(-1) === '') lines.pop()
    for (const text of lines) {
      rows.push(part.added ? { type: 'add', newNum: newNum++, text }
        : part.removed ? { type: 'del', oldNum: oldNum++, text }
        : { type: 'context', oldNum: oldNum++, newNum: newNum++, text })
    }
  }
  return rows
}
