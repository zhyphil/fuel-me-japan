import { test, expect } from "./offline";

const origin = "https://fuel-me-japan.com";
const languages = ["en", "zh-Hant", "ko", "zh-Hans", "th"];
const sections = ["", "return-car/", "refuel-guide/", "about/"];

test("sitemap contains canonical public pages with reciprocal languages and indexing enabled", async ({ page, request }) => {
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
    expect(head.robots, url).toBe("index, follow");
    expect(head.title?.trim(), url).toBeTruthy();
    expect(head.heading?.trim(), url).toBeTruthy();
    const suffix = new URL(url).pathname.split("/").slice(2).join("/");
    expect(head.alternates).toEqual([...languages.map(language => ({ language, href: `${origin}/${language}/${suffix}` })), { language: "x-default", href: `${origin}/en/${suffix}` }]);
    await page.goto(new URL(url).pathname);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", url);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  }
});

test("robots advertises the production sitemap and allows only approved page paths plus rendering resources", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const robots = await response.text();
  expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(robots).toMatch(/^Disallow:\s*\/\s*$/m);
  expect(robots).toContain("Allow: /sitemap.xml");
  for (const locale of languages) for (const section of sections) {
    expect(robots).toContain(`Allow: /${locale}/${section}$`);
  }
  for (const path of ["/assets/", "/brands/", "/icons/", "/data/", "/runtime-map-provider.json"]) {
    expect(robots).toContain(`Allow: ${path}`);
  }
  expect(robots.split("User-agent: *")[1]).not.toMatch(/^Allow:\s*\/\s*$/m);
});


test("root and slash aliases keep the same canonical URL after JavaScript runs", async ({ page }) => {
  for (const [path, canonical] of [["/", "/en/"], ["/en", "/en/"], ["/zh-Hans/about", "/zh-Hans/about/"], ["/th/refuel-guide", "/th/refuel-guide/"]]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + canonical);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute("href", origin + canonical.replace(/^\/[^/]+\//, "/en/"));
  }
});

test("queries, detail pages and missing routes stay noindex and navigation restores the public page policy", async ({ page }) => {
  for (const path of ["/zh-Hans/return-car/?q=OKA", "/zh-Hans/return-car/times-naha-airport/", "/zh-Hans/return-car/not-a-record/", "/zh-Hans/not-a-page/"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await page.locator("#about-link").click();
    await expect(page).toHaveURL("/zh-Hans/about/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + "/zh-Hans/about/");
  }
});
