/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { resolveToRealPath } from '../utils/paths.js';
import {
  getCommandRoots,
  parseCommandDetails,
  initializeShellParsers,
  REDIRECTION_NAMES,
} from '../utils/shell-utils.js';

const IS_WINDOWS = os.platform() === 'win32';
const IS_CASE_INSENSITIVE = IS_WINDOWS || os.platform() === 'darwin';

/**
 * Service for protecting system-critical paths from unauthorized modifications.
 */
export class SystemProtectionService {
  private static readonly REAL_PATH_CACHE = new Map<string, string>();

  private static readonly FORBIDDEN_CONFIG: Array<{
    path: string;
    always: boolean;
  }> = [
    // Linux/macOS - Always forbidden (Read & Write)
    { path: '/etc', always: true },
    { path: '/private/etc', always: true },
    { path: '/root', always: true },
    { path: '/boot', always: true },
    { path: '/dev', always: true },
    { path: '/proc', always: true },
    { path: '/sys', always: true },
    { path: '/private/var', always: true },
    // Linux/macOS - Write-only forbidden
    { path: '/bin', always: false },
    { path: '/sbin', always: false },
    { path: '/usr/bin', always: false },
    { path: '/usr/sbin', always: false },
    { path: '/System', always: false },
    { path: '/Library', always: false },
    // Windows
    ...(IS_WINDOWS
      ? [
          { path: process.env['SystemRoot'] || 'C:\\Windows', always: false },
          {
            path: process.env['ProgramFiles'] || 'C:\\Program Files',
            always: false,
          },
          {
            path: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
            always: false,
          },
          {
            path: process.env['ProgramData'] || 'C:\\ProgramData',
            always: false,
          },
          {
            path: path.join(
              process.env['SystemDrive'] || 'C:',
              'Users',
              'Public',
            ),
            always: false,
          },
          {
            path: path.join(
              process.env['SystemDrive'] || 'C:',
              'Users',
              'Default',
            ),
            always: true,
          },
        ]
      : []),
  ].map((item) => ({
    ...item,
    path: IS_WINDOWS ? item.path.replace(/\//g, '\\') : item.path,
  }));

  private static readonly RESOLVED_FORBIDDEN = new Set(
    this.FORBIDDEN_CONFIG.map((item) => {
      try {
        const resolved = resolveToRealPath(item.path);
        return { ...item, path: resolved };
      } catch {
        return item;
      }
    }),
  );

  private static readonly ALL_FORBIDDEN = [
    ...this.FORBIDDEN_CONFIG,
    ...this.RESOLVED_FORBIDDEN,
  ];

  /**
   * Validates if a file path is system-protected.
   * @param absolutePath The absolute path to check.
   * @param checkType The type of access to check ('read' or 'write').
   * @returns An error message if the path is protected, otherwise null.
   */
  static validatePath(
    absolutePath: string,
    checkType: 'read' | 'write' = 'write',
  ): string | null {
    const normalizedTarget = this.normalize(absolutePath);

    for (const forbidden of this.ALL_FORBIDDEN) {
      if (checkType === 'read' && !forbidden.always) {
        continue;
      }

      const normalizedForbidden = this.normalize(forbidden.path);

      if (
        normalizedTarget === normalizedForbidden ||
        normalizedTarget.startsWith(normalizedForbidden + '/')
      ) {
        return `Access denied: Path "${absolutePath}" is a system-protected location.`;
      }
    }

    // Double check real path
    try {
      if (path.isAbsolute(absolutePath)) {
        let realPath = this.REAL_PATH_CACHE.get(absolutePath);
        if (!realPath) {
          realPath = this.normalize(resolveToRealPath(absolutePath));
          this.REAL_PATH_CACHE.set(absolutePath, realPath);
        }

        if (realPath !== normalizedTarget) {
          for (const forbidden of this.ALL_FORBIDDEN) {
            if (checkType === 'read' && !forbidden.always) {
              continue;
            }

            const normalizedForbidden = this.normalize(forbidden.path);

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
   * Checks if a path belongs to a known system-protected area.
   * @param absolutePath The absolute path to check.
   * @returns true if the path is in a protected area, false otherwise.
   */
  static isSystemPath(absolutePath: string): boolean {
    const normalizedTarget = this.normalize(absolutePath);

    for (const forbidden of this.ALL_FORBIDDEN) {
      const normalizedForbidden = this.normalize(forbidden.path);

      if (
        normalizedTarget === normalizedForbidden ||
        normalizedTarget.startsWith(normalizedForbidden + '/')
      ) {
        return true;
      }
    }

    // Double check real path
    try {
      if (path.isAbsolute(absolutePath)) {
        let realPath = this.REAL_PATH_CACHE.get(absolutePath);
        if (!realPath) {
          realPath = this.normalize(resolveToRealPath(absolutePath));
          this.REAL_PATH_CACHE.set(absolutePath, realPath);
        }

        if (realPath !== normalizedTarget) {
          for (const forbidden of this.ALL_FORBIDDEN) {
            const normalizedForbidden = this.normalize(forbidden.path);

            if (
              realPath === normalizedForbidden ||
              realPath.startsWith(normalizedForbidden + '/')
            ) {
              return true;
            }
          }
        }
      }
    } catch {
      // Ignore resolution errors
    }

    return false;
  }

  private static normalize(p: string): string {
    const normalized = p.replace(/\\/g, '/');
    return IS_CASE_INSENSITIVE ? normalized.toLowerCase() : normalized;
  }

  /**
   * Validates a shell command for potential system-level risks.
   * @param command The shell command to validate.
   * @param cwd The working directory where the command will be executed.
   * @returns An error message if a risk is detected, otherwise null.
   */
  static async validateShellCommand(
    command: string,
    cwd: string,
  ): Promise<string | null> {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) {
      return null;
    }

    try {
      await initializeShellParsers();
    } catch {
      // Ignore initialization errors and fall back to legacy
    }

    const parsed = parseCommandDetails(normalizedCommand);

    if (parsed && !parsed.hasError) {
      const highRiskCommands = new Set([
        'rm',
        'mv',
        'cp',
        'dd',
        'chmod',
        'chown',
        'ln',
      ]);

      for (const detail of parsed.details) {
        // Check for redirection
        if (REDIRECTION_NAMES.has(detail.name)) {
          const target =
            detail.target || this.extractRedirectionTarget(detail.text);
          if (target) {
            const unquotedTarget = this.unquote(target);
            const resolvedTarget = path.resolve(cwd, unquotedTarget);
            const error = this.validatePath(resolvedTarget, 'write');
            if (error) {
              return `Security Error: Command contains redirection to a protected path: "${unquotedTarget}".`;
            }
          }
        }

        // Check for high-risk commands
        if (highRiskCommands.has(detail.name) && detail.args) {
          for (const arg of detail.args) {
            const unquotedArg = this.unquote(arg);
            // Check if arg looks like a path
            if (
              unquotedArg.startsWith('/') ||
              unquotedArg.startsWith('.') ||
              /^[a-zA-Z]:/.test(unquotedArg)
            ) {
              const resolvedPart = path.resolve(cwd, unquotedArg);
              const error = this.validatePath(resolvedPart, 'write');
              if (error) {
                return `Security Error: Command "${detail.name}" targets a protected path: "${unquotedArg}".`;
              }
            }
          }
        }
      }
    } else {
      // Fallback for cases where parser fails or isn't available
      return this.validateShellCommandLegacy(normalizedCommand, cwd);
    }

    return null;
  }

  private static extractRedirectionTarget(text: string): string | null {
    // Matches >, >>, <, << and captures the following part, skipping whitespace
    const match = text.match(/[0-9]*[<>]{1,2}\s*(\S+)/);
    return match ? match[1] : null;
  }

  private static unquote(text: string): string {
    if (text.length >= 2) {
      const first = text[0];
      const last = text[text.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return text.slice(1, -1);
      }
    }
    // Also handle escaped spaces if not quoted
    return text.replace(/\\ /g, ' ');
  }

  /**
   * Legacy validation logic as a fallback.
   */
  private static validateShellCommandLegacy(
    command: string,
    cwd: string,
  ): string | null {
    // Check for redirection (e.g. > /etc/passwd)
    // Improved regex to handle quoted redirection targets
    const redirectionMatches = command.match(
      /[>]{1,2}\s*(?:"[^"]*"|'[^']*'|[^\s;&|()]+)/g,
    );
    if (redirectionMatches) {
      for (const match of redirectionMatches) {
        const target = match.replace(/[>]{1,2}\s*/, '').trim();
        if (target) {
          const unquotedTarget = this.unquote(target);
          const resolvedTarget = path.resolve(cwd, unquotedTarget);
          const error = this.validatePath(resolvedTarget, 'write');
          if (error) {
            return `Security Error: Command contains redirection to a protected path: "${unquotedTarget}".`;
          }
        }
      }
    }

    let roots = getCommandRoots(command);
    if (roots.length === 0) {
      // Use a quote-aware match instead of simple split
      const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const firstWord = parts[0];
      if (firstWord) {
        roots = [this.unquote(firstWord)];
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
        // Use a more sophisticated split that respects simple quotes
        // This is still legacy, but better than before.
        const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        for (const part of parts) {
          const unquotedPart = this.unquote(part);
          if (unquotedPart.startsWith('/') || /^[a-zA-Z]:/.test(unquotedPart)) {
            const resolvedPart = path.resolve(cwd, unquotedPart);
            const error = this.validatePath(resolvedPart, 'write');
            if (error) {
              return `Security Error: Command "${root}" targets a protected path: "${unquotedPart}".`;
            }
          }
        }
      }
    }

    return null;
  }
}
