import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentId } from './store.ts'

// One bar in the header: a plan window ("5H", "7D") or a monthly credit budget ("MONTH").
export type Meter = { name: string; percent: number; resetsAt?: string; detail?: string }
export type AgentUsage = { agent: AgentId; meters: Meter[]; error?: string }

const CREDENTIALS = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), '.credentials.json')
const CACHE_MS = 60_000 // the endpoint is undocumented: be a polite client, whatever the browser's poll rate

type Window = { utilization: number | null; resets_at: string | null } | null
type ExtraUsage = { is_enabled: boolean; monthly_limit: number | null; used_credits: number | null; currency: string | null; decimal_places: number | null } | null
type ClaudeUsage = { five_hour?: Window; seven_day?: Window; extra_usage?: ExtraUsage }

export function parseClaudeUsage(body: ClaudeUsage): Meter[] {
  const meters: Meter[] = []
  for (const [name, w] of [['5H', body.five_hour], ['7D', body.seven_day]] as const) {
    if (w?.utilization != null) meters.push({ name, percent: w.utilization, resetsAt: w.resets_at ?? undefined })
  }
  // Usage-based billing: credits spent this month against the limit set on the account.
  // ponytail: credit amounts are assumed to be minor units (decimal_places); unverified on a live extra-usage account
  const x = body.extra_usage
  if (x?.is_enabled && x.monthly_limit) {
    const scale = 10 ** (x.decimal_places ?? 2)
    const used = (x.used_credits ?? 0) / scale
    const limit = x.monthly_limit / scale
    meters.push({ name: 'MONTH', percent: (used / limit) * 100, detail: `${used.toFixed(2)} / ${limit.toFixed(2)} ${x.currency ?? ''}`.trim() })
  }
  return meters
}

// ponytail: reads the Claude Code login file, so this is empty on macOS (keychain); add a keychain read if that matters
async function claudeUsage(): Promise<AgentUsage> {
  const fail = (error: string): AgentUsage => ({ agent: 'claude', meters: [], error })
  let oauth: { accessToken?: string; expiresAt?: number } | undefined
  try {
    oauth = JSON.parse(await readFile(CREDENTIALS, 'utf8')).claudeAiOauth
  } catch {
    return fail('no Claude login found')
  }
  if (!oauth?.accessToken) return fail('no subscription login (API keys have no plan limits)')
  if ((oauth.expiresAt ?? 0) < Date.now()) return fail('login expired, run claude once to refresh it')
  try {
    // The token goes to Anthropic only: it is never logged, returned to the browser, or put in an error message.
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { authorization: `Bearer ${oauth.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return fail(`usage lookup failed (HTTP ${res.status})`)
    return { agent: 'claude', meters: parseClaudeUsage((await res.json()) as ClaudeUsage) }
  } catch {
    return fail('usage lookup failed')
  }
}

let cached: { at: number; value: AgentUsage[] } | undefined

// ponytail: Claude only. Codex and Kiro are not installed here, so their formats cannot be verified; add a provider per agent once they can be
export async function getUsage(): Promise<AgentUsage[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
  const value = [await claudeUsage()]
  cached = { at: Date.now(), value }
  return value
}
