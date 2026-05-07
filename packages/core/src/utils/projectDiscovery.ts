/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import { debugLogger } from './debugLogger.js';
import { getErrorMessage } from './errors.js';

let sharedAuth: GoogleAuth | undefined;

/** @internal */
export function resetSharedAuthForTesting(): void {
  sharedAuth = undefined;
}

/**
 * Attempts to discover the Google Cloud project ID.
 * It checks environment variables and Application Default Credentials (ADC).
 */
export async function discoverProjectId(): Promise<string | undefined> {
  // GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_PROJECT_ID are checked by GoogleAuth.getProjectId()
  // but we can also log if they are present.
  const envProjectId =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'];

  if (envProjectId) {
    debugLogger.debug(`Using project ID from environment: ${envProjectId}`);
    return envProjectId;
  }

  try {
    if (!sharedAuth) {
      sharedAuth = new GoogleAuth();
    }
    const projectId = await sharedAuth.getProjectId();
    if (projectId) {
      debugLogger.debug(`Discovered project ID via ADC: ${projectId}`);
      return projectId;
    }
  } catch (error) {
    // Discovery failed, which might be normal in some environments
    debugLogger.debug('Failed to discover project ID:', getErrorMessage(error));
  }
  return undefined;
}
