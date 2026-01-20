# Test 9: Message Truncation

## Overview

Tests that when large messages are sent to an LLM, Sentry correctly tracks the original message count vs. the potentially truncated message count in the captured span data.

## Scenario

1. Send three large messages (each ~9KB of data) to the LLM
2. Verify that `gen_ai.request.messages` array length is less than or equal to `gen_ai.request.messages.original_length`

## Purpose

This test verifies that Sentry's AI SDK integration properly handles message truncation for telemetry purposes, ensuring:
- The original message count is preserved as `gen_ai.request.messages.original_length`
- The actual captured messages may be truncated for telemetry size limits
- The relationship `len(messages) <= original_length` always holds

## Expected Behavior

- Span should have `gen_ai.request.messages.original_length` attribute with value 3 (or more, depending on system message handling)
- Span should have `gen_ai.request.messages` as a JSON array
- The array length should be less than or equal to `gen_ai.request.messages.original_length`

## Test Inputs

- **model**: The LLM model to use
- **message_size_kb**: Size of each message content in kilobytes (default: 9)
- **message_count**: Number of large messages to send (default: 3)
