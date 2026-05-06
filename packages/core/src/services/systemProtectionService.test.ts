/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SystemProtectionService } from './systemProtectionService.js';

describe('SystemProtectionService', () => {
  describe('validatePath', () => {
    it('should block protected system paths for write', () => {
      if (process.platform !== 'win32') {
        expect(
          SystemProtectionService.validatePath('/etc/passwd', 'write'),
        ).not.toBeNull();
        expect(
          SystemProtectionService.validatePath('/bin/ls', 'write'),
        ).not.toBeNull();
        expect(
          SystemProtectionService.validatePath('/usr/bin/node', 'write'),
        ).not.toBeNull();
      } else {
        expect(
          SystemProtectionService.validatePath(
            'C:\\Windows\\System32\\cmd.exe',
            'write',
          ),
        ).not.toBeNull();
      }
    });

    it('should allow read access to some protected paths', () => {
      if (process.platform !== 'win32') {
        // These are in WRITE_ONLY_FORBIDDEN_PATHS (always: false)
        expect(
          SystemProtectionService.validatePath('/usr/bin/node', 'read'),
        ).toBeNull();
        expect(
          SystemProtectionService.validatePath('/bin/ls', 'read'),
        ).toBeNull();
        expect(
          SystemProtectionService.validatePath('/System/Library', 'read'),
        ).toBeNull();

        // These are in ALWAYS_FORBIDDEN_PATHS (always: true)
        expect(
          SystemProtectionService.validatePath('/etc/passwd', 'read'),
        ).not.toBeNull();
        expect(
          SystemProtectionService.validatePath('/root/.ssh', 'read'),
        ).not.toBeNull();
      } else {
        expect(
          SystemProtectionService.validatePath(
            'C:\\Windows\\System32\\cmd.exe',
            'read',
          ),
        ).toBeNull();
        expect(
          SystemProtectionService.validatePath(
            'C:\\Program Files\\Nodejs\\node.exe',
            'read',
          ),
        ).toBeNull();
      }
    });

    it('should block subpaths of protected directories', () => {
      if (process.platform !== 'win32') {
        expect(
          SystemProtectionService.validatePath('/etc/ssh/sshd_config'),
        ).not.toBeNull();
        expect(
          SystemProtectionService.validatePath('/System/Library/CoreServices'),
        ).not.toBeNull();
      }
    });

    it('should allow non-protected paths', () => {
      expect(
        SystemProtectionService.validatePath('/work/project/index.ts'),
      ).toBeNull();
      expect(
        SystemProtectionService.validatePath('/tmp/gemini-test/foo.txt'),
      ).toBeNull();
    });

    it('should handle case-sensitivity correctly', () => {
      if (process.platform === 'linux') {
        // On Linux, /ETC is NOT /etc
        expect(SystemProtectionService.validatePath('/ETC/passwd')).toBeNull();
      } else if (
        process.platform === 'darwin' ||
        process.platform === 'win32'
      ) {
        // On macOS/Windows, it's case-insensitive
        expect(
          SystemProtectionService.validatePath('/ETC/passwd'),
        ).not.toBeNull();
      }
    });
  });

  describe('validateShellCommand', () => {
    it('should block redirection to protected paths', async () => {
      const cwd = '/work/project';
      expect(
        await SystemProtectionService.validateShellCommand(
          'echo "test" > /etc/passwd',
          cwd,
        ),
      ).not.toBeNull();
      expect(
        await SystemProtectionService.validateShellCommand(
          'cat foo >> /bin/sh',
          cwd,
        ),
      ).not.toBeNull();
    });

    it('should block high-risk commands targeting protected paths', async () => {
      const cwd = '/work/project';
      expect(
        await SystemProtectionService.validateShellCommand('rm -rf /etc', cwd),
      ).not.toBeNull();
      expect(
        await SystemProtectionService.validateShellCommand(
          'mv index.ts /bin/node',
          cwd,
        ),
      ).not.toBeNull();
    });

    it('should allow safe shell commands', async () => {
      const cwd = '/work/project';
      expect(
        await SystemProtectionService.validateShellCommand('ls -la', cwd),
      ).toBeNull();
      expect(
        await SystemProtectionService.validateShellCommand('npm install', cwd),
      ).toBeNull();
      expect(
        await SystemProtectionService.validateShellCommand(
          'echo "hello" > output.txt',
          cwd,
        ),
      ).toBeNull();
    });

    it('should handle quoted paths in shell commands', async () => {
      const cwd = '/work/project';
      expect(
        await SystemProtectionService.validateShellCommand(
          'rm "/etc/passwd"',
          cwd,
        ),
      ).not.toBeNull();
      expect(
        await SystemProtectionService.validateShellCommand(
          "rm '/etc/passwd'",
          cwd,
        ),
      ).not.toBeNull();
    });

    it('should handle escaped spaces in shell commands', async () => {
      const cwd = '/work/project';
      // Mocking a situation where we have a protected path with spaces (unlikely but test logic)
      // Actually let's just test it doesn't crash and correctly identifies parts.
      expect(
        await SystemProtectionService.validateShellCommand(
          'ls /path\\ with\\ spaces',
          cwd,
        ),
      ).toBeNull();
    });
  });
});
