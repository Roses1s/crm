from pathlib import Path

from app.core.attachment_paths import is_thumbnail_path, thumbnail_path


def test_thumbnail_path_uses_a_distinct_webp_sidecar() -> None:
    original = Path("/var/lib/crm/attachments/12345.jpeg")

    thumbnail = thumbnail_path(original)

    assert thumbnail == original.with_name("12345.thumbnail.webp")
    assert thumbnail != original
    assert is_thumbnail_path(thumbnail)
    assert not is_thumbnail_path(original)
