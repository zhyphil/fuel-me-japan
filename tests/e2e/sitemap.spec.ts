import { test, expect } from "./offline";

const origin = "https://fuel-me-japan.com";
const languages = ["en", "zh-Hant", "ko", "zh-Hans", "th"];
const sections = ["", "return-car/", "refuel-guide/", "about/"];

test("sitemap contains canonical public pages with reciprocal languages while the current noindex restriction remains", async ({ page, request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/(?:application|text)\/xml/);
  const parsed = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return {
      errors: doc.querySelectorAll("parsererror").length,
      root: doc.documentElement.localName,
      namespace: doc.documentElement.namespaceURI,
      urls: [...doc.getElementsByTagNameNS("http://www.sitemaps.org/schemas/sitemap/0.9", "loc")].map(node => node.textContent),
      lastmods: doc.getElementsByTagName("lastmod").length,
    };
  }, await response.text());
  expect(parsed.errors).toBe(0);
  expect(parsed.root).toBe("urlset");
  expect(parsed.namespace).toBe("http://www.sitemaps.org/schemas/sitemap/0.9");
  const expected = languages.flatMap(locale => sections.map(section => `${origin}/${locale}/${section}`));
  expect(parsed.urls.sort()).toEqual(expected.sort());
  expect(new Set(parsed.urls).size).toBe(20);
  // No build-time timestamps masquerading as content updates.
  expect(parsed.lastmods).toBe(0);
  for (const url of expected) {
    const htmlResponse = await request.get(new URL(url).pathname);
    expect(htmlResponse.status(), url).toBe(200);
    const head = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return {
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
        robots: doc.querySelector('meta[name="robots"]')?.getAttribute("content"),
        title: doc.title,
        heading: doc.querySelector("h1")?.textContent,
        alternates: [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map(node => ({ language: node.getAttribute("hreflang"), href: node.getAttribute("href") })),
      };
    }, await htmlResponse.text());
    expect(head.canonical, url).toBe(url);
    expect(head.robots, url).toBe("noindex, nofollow");
    expect(head.title?.trim(), url).toBeTruthy();
    expect(head.heading?.trim(), url).toBeTruthy();
    const suffix = new URL(url).pathname.split("/").slice(2).join("/");
    expect(head.alternates).toEqual([...languages.map(language => ({ language, href: `${origin}/${language}/${suffix}` })), { language: "x-default", href: `${origin}/en/${suffix}` }]);
  }
});

test("robots advertises the production sitemap without removing the existing page crawl restriction", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const robots = await response.text();
  expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(robots).toMatch(/^Disallow:\s*\/\s*$/m);
  expect(robots).toContain("Allow: /sitemap.xml");
});

