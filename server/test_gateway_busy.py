"""Self-check: gateway turn-active detection."""
from main import gateway_turn_active


def test_busy_after_inbound():
    lines = [
        "INFO gateway.run: inbound message: platform=discord chat=1 msg='hi'",
    ]
    assert gateway_turn_active("default", lines) is True


def test_idle_after_response():
    lines = [
        "INFO gateway.run: inbound message: platform=discord chat=1 msg='hi'",
        "INFO gateway.run: response ready: platform=discord chat=1 time=1.0s",
    ]
    assert gateway_turn_active("default", lines) is False


def test_second_turn_busy():
    lines = [
        "INFO gateway.run: inbound message: platform=discord chat=1 msg='a'",
        "INFO gateway.run: response ready: platform=discord chat=1 time=1.0s",
        "INFO gateway.run: inbound message: platform=discord chat=1 msg='b'",
    ]
    assert gateway_turn_active("default", lines) is True


if __name__ == "__main__":
    test_busy_after_inbound()
    test_idle_after_response()
    test_second_turn_busy()
    print("ok")
