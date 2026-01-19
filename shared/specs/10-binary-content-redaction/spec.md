# Test 10: Binary Content Redaction

## Overview

Tests that when binary data (such as images) is sent to an LLM, Sentry correctly redacts the binary content in the captured span data and replaces it with a substitute marker.

## Scenario

1. Send a message containing binary image data to the LLM
2. Verify that the `gen_ai.request.messages` contains the redaction marker "[Blob substitute]" instead of the raw binary data

## Purpose

This test verifies that Sentry's AI SDK integration properly handles binary content for telemetry purposes, ensuring:
- Binary data is not sent as raw bytes to Sentry (which would be inefficient and potentially problematic)
- A clear marker indicates that binary content was redacted
- The message structure is preserved with the redaction marker in place

## Expected Behavior

- Span should have `gen_ai.request.messages` as a JSON array
- The stringified JSON should contain "[Blob substitute]" indicating binary content was redacted
- The LLM call should complete successfully

## Test Inputs

- **model**: The LLM model to use (must support vision/image input)
- **image_type**: Type of image to simulate (default: "png")
