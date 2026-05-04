/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { resolveToRealPath } from '../utils/paths.js';
import { getCommandRoots } from '../utils/shell-utils.js';

/**
 * Service for protecting system-critical paths from unauthorized modifications.
 */
export class SystemProtectionService {
  private static readonly RAW_FORBIDDEN_PATHS = [
    // Linux/macOS
    '/etc',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/boot',
    '/dev',
    '/proc',
    '/sys',
    '/root',
    '/System',
    '/Library',
    '/private/etc',
    '/private/var',
    // Windows
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\Users',
  ].map((p) => (path.sep === '\\' ? p.replace(/\//g, '\\') : p));

  private static readonly RESOLVED_FORBIDDEN_PATHS = new Set(
    this.RAW_FORBIDDEN_PATHS.map((p) => {
      try {
        return resolveToRealPath(p);
      } catch {
        return p;
      }
    }),
  );

  private static readonly ALL_FORBIDDEN_PATHS = new Set([
    ...this.RAW_FORBIDDEN_PATHS,
    ...this.RESOLVED_FORBIDDEN_PATHS,
  ]);

  /**
   * Validates if a file path is system-protected.
   * @param absolutePath The absolute path to check.
   * @returns An error message if the path is protected, otherwise null.
   */
  static validatePath(absolutePath: string): string | null {
    const normalizedTarget = absolutePath.replace(/\\/g, '/').toLowerCase();

    for (const forbidden of this.ALL_FORBIDDEN_PATHS) {
      const normalizedForbidden = forbidden.replace(/\\/g, '/').toLowerCase();

      if (
        normalizedTarget === normalizedForbidden ||
        normalizedTarget.startsWith(normalizedForbidden + '/')
      ) {
        return `Access denied: Path "${absolutePath}" is a system-protected location.`;
      }
    }

    // Double check real path if possible
    try {
      if (path.isAbsolute(absolutePath)) {
        const realPath = resolveToRealPath(absolutePath)
          .replace(/\\/g, '/')
          .toLowerCase();
        if (realPath !== normalizedTarget) {
          for (const forbidden of this.ALL_FORBIDDEN_PATHS) {
            const normalizedForbidden = forbidden
              .replace(/\\/g, '/')
              .toLowerCase();

            if (
              realPath === normalizedForbidden ||
              realPath.startsWith(normalizedForbidden + '/')
            ) {
              return `Access denied: Path "${absolutePath}" (resolved to "${realPath}") is a system-protected location.`;
            }
          }
        }
      }
    } catch {
      // Ignore resolution errors
    }

    return null;
  }

  /**
   * Validates a shell command for potential system-level risks.
   * Currently detects redirections to protected paths.
   * @param command The shell command to validate.
   * @param cwd The working directory where the command will be executed.
   * @returns An error message if a risk is detected, otherwise null.
   */
  static validateShellCommand(command: string, cwd: string): string | null {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) {
      return null;
    }

    // Check for redirection (e.g. > /etc/passwd)
    // We use a broader regex that catches most common redirection patterns
    const redirectionMatches = normalizedCommand.match(
      /[>]{1,2}\s*([^\s;&|()]+)/g,
    );
    if (redirectionMatches) {
      for (const match of redirectionMatches) {
        const target = match.replace(/[>]{1,2}\s*/, '').trim();
        if (target) {
          const resolvedTarget = path.resolve(cwd, target);
          const error = this.validatePath(resolvedTarget);
          if (error) {
            return `Security Error: Command contains redirection to a protected path: "${target}".`;
          }
        }
      }
    }

    // Check for common destructive commands targeting root or system paths
    const roots = getCommandRoots(normalizedCommand);
    // Fallback to simple regex if parser returned nothing
    if (roots.length === 0) {
      const firstWord = normalizedCommand.split(/\s+/)[0];
      if (firstWord) {
        roots.push(firstWord);
      }
    }

    const highRiskCommands = new Set([
      'rm',
      'mv',
      'cp',
      'dd',
      'chmod',
      'chown',
      'ln',
    ]);

    for (const root of roots) {
      if (highRiskCommands.has(root)) {
        // If the command is high risk, check all arguments for protected paths
        const parts = normalizedCommand.split(/\s+/);
        for (const part of parts) {
          // Check if part looks like an absolute path or contains a drive letter
          if (part.startsWith('/') || /^[a-zA-Z]:/.test(part)) {
            const resolvedPart = path.resolve(cwd, part);
            const error = this.validatePath(resolvedPart);
            if (error) {
              return `Security Error: Command "${root}" targets a protected path: "${part}".`;
            }
          }
        }
      }
    }

    return null;
  }
}
