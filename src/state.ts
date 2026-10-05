export type AgentState = 'working' | 'waiting' | 'idle' | 'exited'

// Permission and confirmation prompts of the three CLIs.
const PROMPT = /\(y\/n\)|\[y\/n\]|Do you want to|Esc to cancel|Allow .*\?|Press enter to/i

/**
 * ponytail: screen-scraping heuristic, replace with per-CLI hooks (Claude Code has them) once the
 * state column proves useful; expect false "idle" while an agent thinks silently for >3s.
 */
export function classify(tail: string, idleSecs: number): AgentState {
  if (PROMPT.test(tail)) return 'waiting'
  return idleSecs < 3 ? 'working' : 'idle'
}
