"""Self-check: profile-driven agent roster (no hardcoded nicknames in code)."""
import json
from pathlib import Path

import main as m


def test_discover_uses_profile_ids_not_code_nicknames():
    defs = m.discover_agent_defs(
        {
            "default": {"gateway": "running", "alias": "", "model": "x"},
            "claude": {"gateway": "stopped", "alias": "", "model": "y"},
            "nous-work": {"gateway": "running", "alias": "nous-work", "model": "z"},
        }
    )
    ids = [d["id"] for d in defs]
    assert ids == ["default", "claude", "nous-work"] or set(ids) == {
        "default",
        "claude",
        "nous-work",
    }
    for d in defs:
        assert d["profile"] == d["id"]
        assert d["sheet"].startswith("char-")
        assert isinstance(d["displayName"], str) and d["displayName"]


def test_area_json_override(tmp_path, monkeypatch):
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    (hermes / "config.yaml").write_text("model:\n  default: x\n", encoding="utf-8")
    (hermes / "area.json").write_text(
        json.dumps({"displayName": "테스트봇", "sheet": "char-onion"}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(m, "HERMES_HOME", hermes)
    assert m.resolve_display_name("default") == "테스트봇"
    defs = m.discover_agent_defs(
        {"default": {"gateway": "running", "alias": "", "model": "?"}}
    )
    assert defs[0]["displayName"] == "테스트봇"
    assert defs[0]["sheet"] == "char-onion"


def test_falls_back_to_profile_name(tmp_path, monkeypatch):
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    monkeypatch.setattr(m, "HERMES_HOME", hermes)
    assert m.resolve_display_name("lonely") == "lonely"


if __name__ == "__main__":
    import tempfile

    test_discover_uses_profile_ids_not_code_nicknames()

    original_home = m.HERMES_HOME
    try:
        with tempfile.TemporaryDirectory() as td:

            class MP:
                def setattr(self, obj, name, val):
                    setattr(obj, name, val)

            test_area_json_override(Path(td), MP())
        with tempfile.TemporaryDirectory() as td:

            class MP:
                def setattr(self, obj, name, val):
                    setattr(obj, name, val)

            test_falls_back_to_profile_name(Path(td), MP())
    finally:
        m.HERMES_HOME = original_home

    print("ok")
    for d in m.discover_agent_defs(
        {
            "default": {"gateway": "running", "alias": "", "model": "x"},
            "claude": {"gateway": "stopped", "alias": "", "model": "y"},
            "nous-work": {"gateway": "running", "alias": "nous-work", "model": "z"},
        }
    ):
        print(d["profile"], "→", d["displayName"], d["sheet"])
