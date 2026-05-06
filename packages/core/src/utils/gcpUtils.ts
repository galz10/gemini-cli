/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseGoogleApiError } from './googleErrors.js';

/**
 * Utility class for Google Cloud Platform related operations.
 */
export class GcpUtils {
  /**
   * Extracts a readable error message from a Google API error.
   *
   * @param e The error object to extract the message from.
   * @returns A string representation of the error message.
   */
  static extractErrorMessage(e: unknown): string {
    const apiError = parseGoogleApiError(e);
    if (apiError) {
      return apiError.message;
    }
    return String(e);
  }
}
