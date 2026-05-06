/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GcpUtils } from './gcpUtils.js';

describe('GcpUtils', () => {
  describe('extractErrorMessage', () => {
    it('should extract message from structured Google API error', () => {
      const error = {
        response: {
          data: {
            error: {
              message: 'Service account not found',
              code: 404,
            },
          },
        },
      };
      expect(GcpUtils.extractErrorMessage(error)).toBe(
        'Service account not found',
      );
    });

    it('should extract message from string error response', () => {
      const error = {
        response: {
          data: JSON.stringify({
            error: {
              message: 'Permission denied',
              code: 403,
            },
          }),
        },
      };
      expect(GcpUtils.extractErrorMessage(error)).toBe('Permission denied');
    });

    it('should fall back to String(e) if no structured error is found', () => {
      const error = new Error('Generic error');
      expect(GcpUtils.extractErrorMessage(error)).toBe('Error: Generic error');
    });

    it('should handle null/undefined', () => {
      expect(GcpUtils.extractErrorMessage(null)).toBe('null');
      expect(GcpUtils.extractErrorMessage(undefined)).toBe('undefined');
    });
  });
});
