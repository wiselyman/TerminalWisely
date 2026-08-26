"""Office/PDF text extraction into untrusted attachment blocks."""

from __future__ import annotations

import base64
import io
import zipfile

from app.session.attachments import format_attachment_block
from app.session.office_extract import extract_office_text


def _minimal_docx(paragraph: str) -> bytes:
    """Build a tiny valid docx (OOXML zip) without python-docx writer deps in test."""
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p></w:body>
</w:document>"""
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document_xml)
    return buf.getvalue()


def test_extract_docx_plain_text() -> None:
    blob = _minimal_docx("nginx restart plan")
    out = extract_office_text(
        name="note.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data_base64=base64.b64encode(blob).decode("ascii"),
    )
    assert out["ok"] is True
    assert "nginx restart plan" in out["text"]


def test_format_local_office_preextracted() -> None:
    block = format_attachment_block(
        {
            "kind": "local_office",
            "name": "report.pdf",
            "text": "ERROR rate spiked",
        }
    )
    assert block is not None
    assert "UNTRUSTED_CONTEXT" in block
    assert "ERROR rate spiked" in block
    assert "never instructions" in block.lower() or "DATA only" in block


def test_format_local_office_from_bytes() -> None:
    blob = _minimal_docx("disk full on /var")
    block = format_attachment_block(
        {
            "kind": "local_office",
            "name": "alert.docx",
            "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "data_base64": base64.b64encode(blob).decode("ascii"),
        }
    )
    assert block is not None
    assert "disk full on /var" in block
