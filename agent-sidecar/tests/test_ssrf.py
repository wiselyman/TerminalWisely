"""SSRF guard: localhost / literal private IPs blocked; domains not DNS-classified."""

from unittest.mock import patch

import pytest

from app.research.provider import ResearchError, assert_public_http_url


def test_localhost_blocked():
    with pytest.raises(ResearchError, match="localhost|Blocked"):
        assert_public_http_url("http://localhost/secret")


def test_loopback_ip_blocked():
    with pytest.raises(ResearchError, match="Blocked"):
        assert_public_http_url("http://127.0.0.1:8080/x")


def test_private_ip_blocked():
    with pytest.raises(ResearchError, match="Blocked"):
        assert_public_http_url("http://192.168.1.1/")


def test_link_local_metadata_blocked():
    with pytest.raises(ResearchError, match="Blocked"):
        assert_public_http_url("http://169.254.169.254/latest/meta-data")


def test_file_scheme_blocked():
    with pytest.raises(ResearchError, match="http"):
        assert_public_http_url("file:///etc/passwd")


def test_public_domain_ok_without_dns_check():
    # Must not call getaddrinfo — Fake-IP / split DNS would false-positive.
    with patch("socket.getaddrinfo") as gai:
        url = assert_public_http_url("https://example.com/path?q=1")
        gai.assert_not_called()
    assert url.startswith("https://example.com/")


def test_domain_ok_even_if_dns_would_be_fake_ip():
    url = assert_public_http_url("https://en.wikipedia.org/wiki/Test")
    assert url.startswith("https://en.wikipedia.org/")
