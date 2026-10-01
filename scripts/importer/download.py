"""Approved HTTPS source URLs only; never send a redirected request."""
import re
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from common import require


APPROVED_URLS = (
    r'https://download\.geofabrik\.de/asia/japan\.html',
    r'https://download\.geofabrik\.de/asia/japan-[0-9]{6}\.osm\.pbf(?:\.md5)?',
    r'https://www\.enecho\.meti\.go\.jp/statistics/petroleum_and_lpgas/pl007/results\.html',
    r'https://www\.enecho\.meti\.go\.jp/statistics/petroleum_and_lpgas/pl007/xlsx/[0-9]{6}\.xlsx',
)


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        # urllib invokes this before constructing/sending the next request.
        # Even a same-host redirect requires a separate source review.
        raise HTTPError(request.full_url, code, 'Source redirects are not allowed', headers, response)


def open_source(url, *, timeout, headers=None):
    require(any(re.fullmatch(pattern, url) for pattern in APPROVED_URLS), 'Unapproved source URL')
    return build_opener(RejectRedirects()).open(Request(url, headers=headers or {}), timeout=timeout)
