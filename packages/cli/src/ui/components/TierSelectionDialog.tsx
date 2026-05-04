/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text } from 'ink';
import { type GeminiUserTier } from '@google/gemini-cli-core';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';

interface TierSelectionDialogProps {
  tiers: GeminiUserTier[];
  onSelect: (tier: GeminiUserTier | undefined) => void;
}

export const TierSelectionDialog = ({
  tiers,
  onSelect,
}: TierSelectionDialogProps) => {
  const items = tiers.map((tier) => ({
    label: tier.name || tier.id || 'Unknown Tier',
    value: tier,
    key: tier.id || tier.name || Math.random().toString(),
    sublabel: tier.description,
  }));

  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold color={theme.text.accent}>
        Multiple Entitlements Detected
      </Text>
      <Newline />
      <Text>
        We found multiple Gemini Code Assist entitlements for your account.
        Please select the one you would like to use for this session:
      </Text>
      <Newline />
      <RadioButtonSelect items={items} onSelect={onSelect} />
      <Newline />
      <Text color={theme.text.secondary}>
        Selecting an Enterprise tier ensures corporate IP guarantees and higher
        quota.
      </Text>
    </Box>
  );
};
