/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

/**
 * Options for headless mode detection.
 */
export interface HeadlessModeOptions {
  /** Explicit prompt string or flag. */
  prompt?: string | boolean;
  /** Initial query positional argument. */
  query?: string | boolean;
  /**
   * The platform to check for (defaults to process.platform).
   * Used primarily for testing.
   */
  platform?: NodeJS.Platform;
  /**
   * Environment variables to check (defaults to process.env).
   * Used primarily for testing.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Detects if the CLI is running in a "headless" (non-interactive) mode.
 *
 * Headless mode is triggered by:
 * 1. Environment variables (CI, GITHUB_ACTIONS).
 * 2. Linux server environment (no DISPLAY or WAYLAND_DISPLAY).
 * 3. process.stdout or process.stdin not being a TTY.
 * 4. Presence of an explicit prompt flag.
 *
 * @param options - Optional flags and arguments from the CLI.
 * @returns true if the environment is considered headless.
 */
export function isHeadlessMode(options?: HeadlessModeOptions): boolean {
  const platform = options?.platform ?? process.platform;
  const env = options?.env ?? process.env;

  // 1. Environment-based checks
  const isIntegrationTest = env['GEMINI_CLI_INTEGRATION_TEST'] === 'true';
  const isCI = env['CI'] === 'true' || env['GITHUB_ACTIONS'] === 'true';
  const hasDisplay =
    !!env['DISPLAY'] || !!env['WAYLAND_DISPLAY'] || !!env['MIR_SOCKET'];

  if ((!isIntegrationTest && isCI) || (platform === 'linux' && !hasDisplay)) {
    return true;
  }

  // 2. TTY and explicit options
  const isNotTTY =
    (!!process.stdin && !process.stdin.isTTY) ||
    (!!process.stdout && !process.stdout.isTTY);

  if (isNotTTY || !!options?.prompt || !!options?.query) {
    return true;
  }

  // Fallback: check process.argv for flags that imply headless mode.
  return process.argv.some((arg) => arg === '-p' || arg === '--prompt');
}
