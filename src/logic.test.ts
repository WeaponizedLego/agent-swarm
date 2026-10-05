import { describe, expect, it } from 'vitest'
import { actionArgv } from './actions.ts'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentArgv, launchArgv, resolveBin } from './agents.ts'
import { UserError } from './errors.ts'
import { cleanBlock, parseLine } from './haiku.ts'
import { findOverlaps } from './housekeeper.ts'
import { detectPm } from './overview.ts'
import { stripTerminalReplies } from './pty-host.ts'
import { slugify } from './sessions.ts'
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
    expect(agentArgv('claude')).toEqual(['claude'])
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
