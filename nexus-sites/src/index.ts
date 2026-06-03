interface Env {
  R2: R2Bucket;
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site not found — NEXUS Sites</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       min-height:100vh;gap:12px;text-align:center;padding:24px}
  h1{font-size:1.5rem;font-weight:600;letter-spacing:-0.02em}
  p{font-size:0.9rem;color:#8b949e}
  a{color:#58a6ff;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>Site not found</h1>
<p>This site hasn't been published yet, or the URL is incorrect.</p>
<p><a href="/">NEXUS Sites</a></p>
</body>
</html>`;

const ROOT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXUS Sites</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       min-height:100vh;gap:8px;text-align:center;padding:24px}
  h1{font-size:2rem;font-weight:700;letter-spacing:-0.03em}
  p{font-size:0.9rem;color:#8b949e;max-width:360px;line-height:1.5}
  .badge{font-size:0.75rem;background:#161b22;border:1px solid #30363d;
         color:#8b949e;padding:3px 10px;border-radius:20px;letter-spacing:0.04em}
</style>
</head>
<body>
<span class="badge">NEXUS</span>
<h1>NEXUS Sites</h1>
<p>Multi-tenant site hosting. Published sites are served at /{slug}/.</p>
</body>
</html>`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/" || path === "") {
      return new Response(ROOT_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const segments = path.split("/").filter(Boolean);
    const slug = segments[0];

    // canonical trailing slash: /{slug} → /{slug}/
    if (segments.length === 1 && !path.endsWith("/")) {
      return Response.redirect(`${url.origin}/${slug}/`, 301);
    }

    // SPA-style fallback: always serve the slug's index.html regardless of sub-path
    try {
      const obj = await env.R2.get(`published/${slug}/index.html`);
      if (!obj) {
        return new Response(NOT_FOUND_HTML, {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response(obj.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          "X-Served-By": "nexus-sites",
        },
      });
    } catch {
      return new Response(NOT_FOUND_HTML, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  },
};
