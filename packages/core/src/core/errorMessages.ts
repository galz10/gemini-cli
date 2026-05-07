/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const CONTENT_GENERATOR_NOT_INITIALIZED =
  'Content generator not initialized. This can happen if authentication failed or your account is not ready.\n' +
  'Troubleshooting steps:\n' +
  '1. Ensure you have completed age verification for your Google account (https://myaccount.google.com/age-verification).\n' +
  '2. Run `gemini login` again to refresh your credentials.\n' +
  '3. If using an API key, verify it is valid in AI Studio (https://aistudio.google.com/).';

export const LOAD_CODE_ASSIST_EMPTY_RESPONSE =
  'LoadCodeAssist returned empty response. This usually indicates a problem with your Google Cloud project or account permissions.\n' +
  'Troubleshooting steps:\n' +
  '1. Ensure you have enabled the Gemini for Google Cloud API in your project.\n' +
  '2. Verify that your account has the necessary IAM permissions (e.g. Cloud AI Companion User).\n' +
  '3. Check if your account requires age verification (https://myaccount.google.com/age-verification).';
