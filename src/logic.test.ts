import { describe, expect, it } from 'vitest'
import { actionArgv } from './actions.ts'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentArgv, launchArgv, resolveBin } from './agents.ts'
import { coverage } from './changes.ts'
import { UserError } from './errors.ts'
import { cleanBlock, parseLine } from './haiku.ts'
import { findOverlaps } from './housekeeper.ts'
import { detectPm } from './overview.ts'
import { stripTerminalReplies } from './pty-host.ts'
import { slugify } from './sessions.ts'
import { importSkills, listSkills, parseDescription, removeSkill, seedSkills } from './skills.ts'
import { parseClaudeUsage } from './usage.ts'
import { classify } from './state.ts'

describe('classify', () => {
  it('flags permission prompts as waiting even when output is fresh', () => {
    expect(classify('Do you want to proceed?\n 1. Yes\n Esc to cancel', 0)).toBe('waiting')
  })
  it('working while output is recent, idle after 3s', () => {
    expect(classify('thinking...', 1)).toBe('working')
    expect(classify('> ', 10)).toBe('idle')
  })
})

describe('slugify', () => {
  it('makes branch- and path-safe names', () => {
    expect(slugify('Add Login / Rate-Limit!!')).toBe('add-login-rate-limit')
    expect(slugify('../../etc')).toBe('etc')
    expect(slugify('***')).toBe('')
  })
})

describe('agentArgv', () => {
  it('maps each agent to its interactive command', () => {
    expect(agentArgv('claude')).toEqual(['claude', '--model', 'claude-opus-5-5', '--permission-mode', 'auto'])
    expect(agentArgv('codex')).toEqual(['codex'])
    expect(agentArgv('kiro')).toEqual(['kiro-cli', 'chat'])
  })
})

describe('parseLine', () => {
  it('cleans one status line out of a model reply', () => {
    expect(parseLine('  - "Running the test suite"  \nextra')).toBe('Running the test suite')
    expect(parseLine('SKIP')).toBeNull()
    expect(parseLine('skip.')).toBeNull()
    expect(parseLine('   \n  ')).toBeNull()
    expect(parseLine('x'.repeat(300))).toHaveLength(140)
  })
})

describe('detectPm', () => {
  const files = (...f: string[]) => (x: string) => f.includes(x)
  it('prefers the declared packageManager over lockfiles', () => {
    expect(detectPm('pnpm@10.33.0+sha512.abc', files('package-lock.json'))).toBe('pnpm')
  })
  it('falls back to the lockfile, then null', () => {
    expect(detectPm(undefined, files('yarn.lock'))).toBe('yarn')
    expect(detectPm(undefined, files('package-lock.json'))).toBe('npm')
    expect(detectPm(undefined, files())).toBeNull()
  })
})

describe('actionArgv', () => {
  const scripts = { test: 'vitest' }
  it('builds fixed verbs and manifest scripts only', () => {
    expect(actionArgv('pnpm', { kind: 'install' }, scripts)).toEqual(['pnpm', 'install'])
    expect(actionArgv('npm', { kind: 'script', script: 'test' }, scripts)).toEqual(['npm', 'run', 'test'])
  })
  it('rejects scripts the repo does not define, including prototype keys', () => {
    expect(() => actionArgv('pnpm', { kind: 'script', script: 'rm -rf /' }, scripts)).toThrow()
    expect(() => actionArgv('pnpm', { kind: 'script', script: 'constructor' }, scripts)).toThrow()
  })
})

describe('cleanBlock', () => {
  it('keeps a few clean lines and bounds the rest', () => {
    expect(cleanBlock('- one\n\n* two\n  three  ')).toBe('one\ntwo\nthree')
    expect(cleanBlock('a\nb\nc\nd', 2)).toBe('a\nb')
    expect(cleanBlock('x'.repeat(2000))).toHaveLength(700)
  })
})

describe('findOverlaps', () => {
  const c = (id: string, repo: string, ...files: string[]) => ({ id, task: id, repo, files: new Set(files) })
  it('reports shared files only within the same repo', () => {
    const out = findOverlaps([c('a', '/r1', 'x.ts', 'y.ts'), c('b', '/r1', 'y.ts', 'z.ts'), c('c', '/r2', 'y.ts')])
    expect(out).toHaveLength(1)
    expect(out[0]!.files).toEqual(['y.ts'])
  })
  it('stays quiet when nothing is shared', () => {
    expect(findOverlaps([c('a', '/r1', 'x.ts'), c('b', '/r1', 'y.ts')])).toEqual([])
  })
})

describe('resolveBin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-bin-'))
  writeFileSync(join(dir, 'codex'), '#!/bin/sh') // npm's extensionless sh shim, unlaunchable on Windows
  writeFileSync(join(dir, 'codex.cmd'), '@echo off')
  chmodSync(join(dir, 'codex'), 0o755)
  it('on Windows finds the .cmd shim via PATHEXT and skips the extensionless one', () => {
    // Windows (and the macOS test disk) is case-insensitive, so PATHEXT's `.CMD` matches `codex.cmd`.
    const [bin, ...rest] = resolveBin(['codex', 'x'], { PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32')
    expect(bin!.toLowerCase()).toBe(join(dir, 'codex.cmd').toLowerCase())
    expect(rest).toEqual(['x'])
  })
  it('on macOS/Linux takes the plain executable', () => {
    expect(resolveBin(['codex'], { PATH: dir }, 'darwin')).toEqual([join(dir, 'codex')])
  })
  it('reports a missing CLI as a user-fixable error', () => {
    expect(() => resolveBin(['nope'], { PATH: dir }, 'darwin')).toThrow(UserError)
  })
})

describe('launchArgv', () => {
  it('runs .cmd shims through cmd.exe on Windows only', () => {
    expect(launchArgv(['C:\\npm\\codex.cmd', 'chat'], 'win32', 'C:\\Windows\\system32\\cmd.exe')).toEqual(['C:\\Windows\\system32\\cmd.exe', '/d', '/c', 'C:\\npm\\codex.cmd', 'chat'])
    expect(launchArgv(['C:\\bin\\claude.exe'], 'win32')).toEqual(['C:\\bin\\claude.exe'])
    expect(launchArgv(['/usr/bin/codex.cmd'], 'darwin')).toEqual(['/usr/bin/codex.cmd'])
  })
})

describe('stripTerminalReplies', () => {
  it('drops a viewer’s automatic terminal replies but keeps real keystrokes', () => {
    expect(stripTerminalReplies('\x1b[12;40R')).toBe('') // cursor position report
    expect(stripTerminalReplies('\x1b[?1;2c\x1b[>0;276;0c')).toBe('') // device attributes 1 and 2
    expect(stripTerminalReplies('\x1b]11;rgb:0a0a/0a0a/0a0a\x1b\\')).toBe('') // background colour reply
    expect(stripTerminalReplies('\x1b[?2004;2$y')).toBe('') // mode report
    expect(stripTerminalReplies('ls -la\r')).toBe('ls -la\r')
    expect(stripTerminalReplies('\x1b[A\x1b[1;5C\x03')).toBe('\x1b[A\x1b[1;5C\x03') // arrows, ctrl-arrow, ctrl-c
  })
})

describe('parseClaudeUsage', () => {
  it('turns the plan windows into meters and skips windows the plan does not have', () => {
    const meters = parseClaudeUsage({
      five_hour: { utilization: 12, resets_at: '2026-10-05T20:00:00Z' },
      seven_day: null,
      extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, currency: null, decimal_places: null },
    })
    expect(meters).toEqual([{ name: '5H', percent: 12, resetsAt: '2026-10-05T20:00:00Z' }])
  })
  it('adds a monthly credit meter only when usage-based billing is on', () => {
    const [month] = parseClaudeUsage({ extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1250, currency: 'USD', decimal_places: 2 } })
    expect(month).toMatchObject({ name: 'MONTH', percent: 25, detail: '12.50 / 50.00 USD' })
  })
})

describe('skills library', () => {
  const library = () => {
    const root = mkdtempSync(join(tmpdir(), 'swarm-skills-'))
    mkdirSync(join(root, 'folded'))
    writeFileSync(join(root, 'folded', 'SKILL.md'), '---\nname: folded\ndescription: >\n  First line\n  second line.\nlicense: MIT\n---\nbody')
    mkdirSync(join(root, 'plain'))
    writeFileSync(join(root, 'plain', 'SKILL.md'), '---\nname: plain\ndescription: "Quoted one"\n---\n')
    mkdirSync(join(root, 'no-skill-md')) // not a skill: ignored
    return root
  }

  it('reads plain, quoted and folded descriptions', () => {
    expect(parseDescription('---\ndescription: >\n  a\n  b\nname: x\n---')).toBe('a b')
    expect(parseDescription('---\ndescription: "q"\n---')).toBe('q')
    expect(parseDescription('no frontmatter')).toBe('')
  })
  it('lists only folders that hold a SKILL.md', () => {
    expect(listSkills(library()).map((s) => [s.name, s.description])).toEqual([
      ['folded', 'First line second line.'],
      ['plain', 'Quoted one'],
    ])
    expect(listSkills(join(tmpdir(), 'swarm-no-such-dir'))).toEqual([])
  })
  it('copies skills into the agent skill dir and refuses names outside the library', () => {
    const lib = library()
    const dir = mkdtempSync(join(tmpdir(), 'swarm-task-'))
    seedSkills(lib, dir, 'claude', ['plain'])
    expect(existsSync(join(dir, '.claude/skills/plain/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, '.claude/skills/folded'))).toBe(false)
    expect(() => seedSkills(lib, dir, 'claude', ['../../etc'])).toThrow(UserError)
  })
  it('imports one skill or a folder of skills without overwriting, and deletes by name', () => {
    const lib = library()
    const incoming = mkdtempSync(join(tmpdir(), 'swarm-incoming-'))
    for (const n of ['x', 'y']) {
      mkdirSync(join(incoming, n))
      writeFileSync(join(incoming, n, 'SKILL.md'), `---\nname: ${n}\ndescription: d\n---\n`)
    }
    expect(importSkills(lib, join(incoming, 'x'))).toEqual(['x'])
    expect(() => importSkills(lib, incoming)).toThrow(/Already in the collection: x/) // all or nothing
    expect(listSkills(lib).map((s) => s.name)).not.toContain('y')
    expect(() => importSkills(lib, 'relative/path')).toThrow(UserError)
    expect(() => importSkills(lib, join(incoming, 'nothing-here'))).toThrow(UserError)
    removeSkill(lib, 'x')
    expect(importSkills(lib, incoming).sort()).toEqual(['x', 'y'])
    expect(() => removeSkill(lib, '../..')).toThrow(UserError)
  })
})

describe('change map coverage', () => {
  const file = (path: string) => ({ path, status: 'M', add: 1, del: 0, symbols: { added: [], removed: [], changed: [] }, patch: [] })
  const repo = (name: string, paths: string[]) => ({ name, branch: 'swarm/x', base: 'abc', how: '', commits: [], files: paths.map(file) })
  const story = (files: string[], hot: string[] = []) => ({
    title: '', tldr: '', diagrams: [], verify: [],
    changes: [{ kind: 'fix', title: 't', files }],
    hotspots: hot.map((f) => ({ file: f, why: '' })),
  })
  it('flags changed files no card explains and named files that did not change', () => {
    const facts = { generatedAt: '', repos: [repo('api', ['a.ts', 'b.ts'])] }
    expect(coverage(facts, story(['a.ts'], ['ghost.ts']))).toEqual({ unexplained: ['b.ts'], phantom: ['ghost.ts'] })
  })
  it('prefixes paths with the repo once a task spans several repos', () => {
    const facts = { generatedAt: '', repos: [repo('api', ['a.ts']), repo('web', ['a.ts'])] }
    expect(coverage(facts, story(['api/a.ts']))).toEqual({ unexplained: ['web/a.ts'], phantom: [] })
  })
})
