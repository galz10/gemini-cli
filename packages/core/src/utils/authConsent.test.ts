/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
  afterEach,
} from 'vitest';
import readline from 'node:readline';
import process from 'node:process';
import { CoreEvent, coreEvents } from './events.js';
import { getConsentForOauth } from './authConsent.js';
import { FatalAuthenticationError } from './errors.js';
import { writeToStdout } from './stdio.js';
import { isHeadlessMode } from './headless.js';

vi.mock('node:readline');
vi.mock('./headless.js', () => ({
  isHeadlessMode: vi.fn(),
}));
vi.mock('./stdio.js', () => ({
  writeToStdout: vi.fn(),
  createWorkingStdio: vi.fn(() => ({
    stdout: process.stdout,
    stderr: process.stderr,
  })),
}));

describe('getConsentForOauth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    // Clear all listeners to start fresh
    coreEvents.removeAllListeners();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('in interactive mode', () => {
    beforeEach(() => {
      (isHeadlessMode as Mock).mockReturnValue(false);
    });

    it('should emit consent request when UI listeners are present', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');

      // Add a dummy listener
      coreEvents.on(CoreEvent.ConsentRequest, () => {});

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(true);
      });

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
      expect(mockEmitConsentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining(
            'Login required. Opening authentication page in your browser.',
          ),
        }),
      );
    });

    it('should wait for UI listener and succeed when one appears', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(true);
      });

      const promise = getConsentForOauth('Login required.');

      // Initially no listeners, so it should be waiting
      expect(coreEvents.listenerCount(CoreEvent.ConsentRequest)).toBe(0);

      // Simulate UI listener being added after a delay
      // We need to advance time enough for the loop to run a few times
      await vi.advanceTimersByTimeAsync(300);
      coreEvents.on(CoreEvent.ConsentRequest, () => {});

      // Advance again to trigger the next poll
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe(true);
      expect(mockEmitConsentRequest).toHaveBeenCalled();
    });

    it('should timeout and throw FatalAuthenticationError if no UI listener appears', async () => {
      const promise = getConsentForOauth('Login required.');

      // We need to advance time past the 10s timeout.
      // We wrap both in Promise.all to ensure the rejection is handled as it happens.
      await Promise.all([
        expect(promise).rejects.toThrow(FatalAuthenticationError),
        vi.advanceTimersByTimeAsync(11000),
      ]);
    });

    it('should handle empty prompt correctly', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      coreEvents.on(CoreEvent.ConsentRequest, () => {});

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(true);
      });

      await getConsentForOauth('');

      expect(mockEmitConsentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringMatching(
            /^Opening authentication page in your browser\./,
          ),
        }),
      );
    });

    it('should return false when user declines via UI', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      coreEvents.on(CoreEvent.ConsentRequest, () => {});

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(false);
      });

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(false);
    });
  });

  describe('in non-interactive mode', () => {
    beforeEach(() => {
      (isHeadlessMode as Mock).mockReturnValue(true);
      vi.useRealTimers(); // Readline tests are easier with real timers
    });

    it('should use readline to prompt for consent', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('y');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
      expect(readline.createInterface).toHaveBeenCalledWith(
        expect.objectContaining({
          terminal: true,
        }),
      );
      expect(writeToStdout).toHaveBeenCalledWith(
        expect.stringContaining('Login required.'),
      );
    });

    it('should accept empty response as "yes"', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
    });

    it('should return false when user declines via readline', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('n');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(false);
    });
  });
});
