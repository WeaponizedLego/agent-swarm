// pnpm installs node-pty's macOS `spawn-helper` without its execute bit, and then every terminal
// attach fails with "posix_spawnp failed". Plain Node (not `chmod`) so `pnpm install` also works
// under cmd.exe on Windows, where there is no spawn-helper and nothing to do.
import { chmodSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform !== 'win32') {
  const prebuilds = join('node_modules', 'node-pty', 'prebuilds')
  let dirs = []
  try {
    dirs = readdirSync(prebuilds)
  } catch {
    // node-pty not installed (yet): nothing to fix
  }
  for (const dir of dirs) {
    try {
      chmodSync(join(prebuilds, dir, 'spawn-helper'), 0o755)
    } catch {
      // win32-* prebuilds have no spawn-helper
    }
  }
}
