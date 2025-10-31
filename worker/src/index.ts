// worker/src/index.ts
export default {
async fetch(request: Request): Promise<Response> {
const url = new URL(request.url);


// Simple health-check
if (url.pathname === "/") {
return new Response(
JSON.stringify({ ok: true, message: "Grok video scraper" }),
{ headers: cors({ "content-type": "application/json" }) }
);
}


if (url.pathname === "/scrape") {
const target = url.searchParams.get("url");
if (!target) return bad(400, "Missing ?url=...");


try {
const t = new URL(target);
if (t.hostname !== "grok.com") {
return bad(400, "Only grok.com URLs are allowed");
}


// Optional: narrow path to /imagine/post
if (!t.pathname.startsWith("/imagine/post/")) {
return bad(400, "URL must be /imagine/post/<id>");
}


const upstream = await fetch(t.toString(), {
// cache at edge for 10 minutes
cf: { cacheTtl: 600, cacheEverything: true },
headers: {
// Some sites need minimal headers; keep modest
"user-agent":
"Mozilla/5.0 (compatible; GrokVideoWorker/1.0; +https://developers.cloudflare.com/workers/)",
accept: "text/html,application/xhtml+xml",
},
});
if (!upstream.ok) return bad(upstream.status, `Upstream error: ${upstream.status}`);
const html = await upstream.text();


// Extract a likely MP4 and poster/thumbnail from the page.
// 1) Look for <video> src
const videoSrc = matchFirst(
html,
/<video[^>]+src=["']([^"']+?\.mp4[^"']*)["'][^>]*>/i
)
// 2) Or <source type="video/mp4" src="...">
?? matchFirst(html, /<source[^>]+type=["']video\/mp4["'][^>]+src=["']([^"']+)["'][^>]*>/i)
// 3) Or any loose .mp4 in the HTML
?? matchFirst(html, /(https?:\/\/[^"'<>]+?\.mp4[^"'<>]*)/i);


// Poster image (if present)
const poster =
matchFirst(html, /<video[^>]+poster=["']([^"']+)["'][^>]*>/i) ??
matchFirst(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
matchFirst(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);


// Title
const title =
matchFirst(html, /<title>([^<]+)<\/title>/i) ??
matchFirst(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
"Grok Imagine";


const payload = { title, poster, mp4: videoSrc, source: target };
return new Response(JSON.stringify(payload), {
headers: cors({ "content-type": "application/json" }),
}