/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SystemProtectionService } from './systemProtectionService.js';

describe('SystemProtectionService', () => {
  describe('validatePath', () => {
    it('should block protected system paths', () => {
      expect(
        SystemProtectionService.validatePath('/etc/passwd'),
      ).not.toBeNull();
      expect(SystemProtectionService.validatePath('/bin/ls')).not.toBeNull();
      expect(
        SystemProtectionService.validatePath('/usr/bin/node'),
      ).not.toBeNull();
    });

    it('should block subpaths of protected directories', () => {
      expect(
        SystemProtectionService.validatePath('/etc/ssh/sshd_config'),
      ).not.toBeNull();
      expect(
        SystemProtectionService.validatePath('/System/Library/CoreServices'),
      ).not.toBeNull();
    });

    it('should allow non-protected paths', () => {
      // Use paths that definitely won't match system patterns
      expect(
        SystemProtectionService.validatePath('/work/project/index.ts'),
      ).toBeNull();
      expect(
        SystemProtectionService.validatePath('/tmp/gemini-test/foo.txt'),
      ).toBeNull();
    });
  });

  describe('validateShellCommand', () => {
    it('should block redirection to protected paths', () => {
      const cwd = '/work/project';
      expect(
        SystemProtectionService.validateShellCommand(
          'echo "test" > /etc/passwd',
          cwd,
        ),
      ).not.toBeNull();
      expect(
        SystemProtectionService.validateShellCommand('cat foo >> /bin/sh', cwd),
      ).not.toBeNull();
    });

    it('should block high-risk commands targeting protected paths', () => {
      const cwd = '/work/project';
      expect(
        SystemProtectionService.validateShellCommand('rm -rf /etc', cwd),
      ).not.toBeNull();
      expect(
        SystemProtectionService.validateShellCommand(
          'mv index.ts /bin/node',
          cwd,
        ),
      ).not.toBeNull();
    });

    it('should allow safe shell commands', () => {
      const cwd = '/work/project';
      expect(
        SystemProtectionService.validateShellCommand('ls -la', cwd),
      ).toBeNull();
      expect(
        SystemProtectionService.validateShellCommand('npm install', cwd),
      ).toBeNull();
      expect(
        SystemProtectionService.validateShellCommand(
          'echo "hello" > output.txt',
          cwd,
        ),
      ).toBeNull();
    });
  });
});
