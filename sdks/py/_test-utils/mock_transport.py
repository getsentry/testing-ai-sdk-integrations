"""
Mock Sentry transport for testing

Captures all Sentry events in memory instead of sending them to Sentry servers.
Provides helpers to query and verify captured events.
"""

import json
from typing import List, Dict, Any, Optional


class MockTransportCapture:
    """Captures Sentry envelopes in memory"""

    def __init__(self):
        self.envelopes: List[Any] = []

    def capture(self, envelope: Any) -> None:
        """Capture an envelope"""
        self.envelopes.append(envelope)

    def clear(self) -> None:
        """Clear all captured envelopes"""
        self.envelopes = []

    def get_envelopes(self) -> List[Any]:
        """Get all captured envelopes"""
        return self.envelopes

    def _parse_envelope_body(self, body: str) -> Dict[str, Any]:
        """
        Parse envelope body string into header and items
        Envelope format is newline-separated:
        Line 1: Envelope headers (JSON)
        Line 2: Item 1 headers (JSON)
        Line 3: Item 1 payload (JSON)
        etc.
        """
        lines = [line for line in body.split("\n") if line.strip()]

        if not lines:
            return {"headers": {}, "items": []}

        # First line is envelope headers
        headers = json.loads(lines[0])
        items = []

        # Remaining lines are pairs of item headers + item payload
        i = 1
        while i < len(lines):
            if i + 1 < len(lines):
                item_headers = json.loads(lines[i])
                item_payload = json.loads(lines[i + 1])
                items.append({"headers": item_headers, "payload": item_payload})
                i += 2
            else:
                break

        return {"headers": headers, "items": items}

    def get_transactions(self) -> List[Dict[str, Any]]:
        """Get all captured transactions"""
        transactions = []

        for envelope in self.envelopes:
            # Handle Envelope objects (sentry_sdk.envelope.Envelope)
            if hasattr(envelope, "items"):
                for item in envelope.items:
                    if hasattr(item, "headers") and item.headers.get("type") == "transaction":
                        # Get the payload - it might be a Payload object
                        if hasattr(item, "payload"):
                            payload = item.payload
                            # If it's a Payload object, get its data
                            if hasattr(payload, "json"):
                                transactions.append(payload.json)
                            elif hasattr(payload, "bytes"):
                                import json
                                transactions.append(json.loads(payload.bytes))
                            else:
                                transactions.append(payload)
            # Fallback: Handle string body format (for backwards compatibility)
            elif hasattr(envelope, "body") or (isinstance(envelope, dict) and "body" in envelope):
                body = envelope.body if hasattr(envelope, "body") else envelope["body"]
                if isinstance(body, str):
                    parsed = self._parse_envelope_body(body)
                    for item in parsed["items"]:
                        if item["headers"].get("type") == "transaction":
                            transactions.append(item["payload"])

        return transactions

    def get_spans(self) -> List[Dict[str, Any]]:
        """Get all captured spans (extracted from transactions)"""
        spans = []

        for transaction in self.get_transactions():
            if "spans" in transaction and isinstance(transaction["spans"], list):
                spans.extend(transaction["spans"])

        return spans

    def get_events(self) -> List[Dict[str, Any]]:
        """Get all captured events (errors, messages, etc.)"""
        events = []

        for envelope in self.envelopes:
            # Handle Envelope objects (sentry_sdk.envelope.Envelope)
            if hasattr(envelope, "items"):
                for item in envelope.items:
                    if hasattr(item, "headers") and item.headers.get("type") == "event":
                        # Get the payload - it might be a Payload object
                        if hasattr(item, "payload"):
                            payload = item.payload
                            # If it's a Payload object, get its data
                            if hasattr(payload, "json"):
                                events.append(payload.json)
                            elif hasattr(payload, "bytes"):
                                import json
                                events.append(json.loads(payload.bytes))
                            else:
                                events.append(payload)
            # Fallback: Handle string body format (for backwards compatibility)
            elif hasattr(envelope, "body") or (isinstance(envelope, dict) and "body" in envelope):
                body = envelope.body if hasattr(envelope, "body") else envelope["body"]
                if isinstance(body, str):
                    parsed = self._parse_envelope_body(body)
                    for item in parsed["items"]:
                        if item["headers"].get("type") == "event":
                            events.append(item["payload"])

        return events


# Global instance
_mock_transport_capture: Optional[MockTransportCapture] = None


def create_mock_transport(options: Optional[Dict[str, Any]] = None) -> Any:
    """
    Create a mock transport factory (to be passed to sentry_sdk.init)

    Args:
        options: Transport options

    Returns:
        Mock transport instance
    """
    global _mock_transport_capture
    from sentry_sdk.transport import Transport

    # Only create if not already set (it should be pre-initialized by setup.py)
    if not _mock_transport_capture:
        _mock_transport_capture = MockTransportCapture()

    class MockTransport(Transport):
        def __init__(self, options):
            # Ensure options has required keys for Transport
            if not options:
                options = {}
            if "dsn" not in options:
                options["dsn"] = None
            Transport.__init__(self, options)

        def capture_event(self, event):
            """Capture an event"""
            if _mock_transport_capture:
                _mock_transport_capture.capture(event)

        def capture_envelope(self, envelope):
            """Capture an envelope"""
            if _mock_transport_capture:
                _mock_transport_capture.capture(envelope)

        def _send_event(self, event):
            """Legacy method for sending events"""
            if _mock_transport_capture:
                _mock_transport_capture.capture(event)

        def _send_envelope(self, envelope):
            """Legacy method for sending envelopes"""
            if _mock_transport_capture:
                _mock_transport_capture.capture(envelope)

    return MockTransport(options)


def get_mock_transport() -> MockTransportCapture:
    """Get the current mock transport capture instance"""
    if not _mock_transport_capture:
        raise RuntimeError(
            "Mock transport not initialized. Did you call sentry_sdk.init with create_mock_transport?"
        )
    return _mock_transport_capture


def clear_mock_transport() -> None:
    """Clear all captured events"""
    if _mock_transport_capture:
        _mock_transport_capture.clear()
