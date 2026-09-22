# Foldscape Memories: deployment loading investigation

## Observations, 2026-09-22

One full-body HTTP request per resource from the development machine (not a
browser waterfall, not a user-wide percentile). Requests to the two hosts ran
concurrently, so these timings should be treated as diagnostic samples.

| Resource | Bytes | developers.tripo3d.ai | developers.tripo3d.com |
| --- | ---: | ---: | ---: |
| Entry JavaScript, decoded size | ~1,254,000 | 5.06 s | 3.50 s |
| Device glTF manifest | 308,101 | 1.88 s | 1.42 s |
| Device geometry BIN | 3,890,544 | 5.94 s | 12.24 s |
| Lighthouse GLB | 25,393,260 | 13.00 s | 18.38 s |

Both hosts gzip the JavaScript. The glTF, BIN and GLB responses tested had no
Content-Encoding and used Cache-Control: public, max-age=86400. Browser caching
therefore already exists; it does not help a first-time visitor. No CDN hit
status was exposed in these responses, so CDN configuration remains unverified.
The hosts serve different entry JS hashes and different asset path layouts.

Local code also waits for model layout processing and shader warmup before
opening a scene. The 25 precise device-centering samples cost about 380 ms in a
local Node geometry benchmark; that is not a browser GPU measurement and does
not explain a 10-second download on its own.

## Changes in this revision

- Pack the device manifest, geometry and 33 images into one self-contained GLB.
  Preload it from HTML, allowing download to start before the app initializes.
- Retain all mesh, rig, animation, material and texture resolution data.
  Replace PNG with lossless WebP only when smaller AND decoded RGBA pixels are
  identical. No mesh simplification or texture downsizing is applied.
- Use content-hashed delivery filenames. Keep source authoring assets intact.
- Supply a gzip sidecar for all six delivery GLBs. A server must actually serve
  these with Content-Encoding: gzip; merely uploading .gz files has no effect.
- Use Vite BASE_URL for the new delivery resource URLs.

| Asset | Original bytes | Delivery bytes | Gzip transfer bytes |
| --- | ---: | ---: | ---: |
| Device, including dependencies | 4,893,796 | 4,762,092 | 2,148,123 |
| Lighthouse | 25,393,260 | 20,326,464 | 18,449,415 |
| Iceberg | 4,827,912 | 4,827,912 | 4,267,444 |
| Coastal house | 7,543,116 | 7,543,116 | 6,336,530 |
| Santorini | 6,806,156 | 6,806,156 | 5,402,464 |
| Osaka Castle | 8,429,744 | 8,429,744 | 7,021,583 |

Regenerate after changing authoring models with `npm run assets:delivery -- --encoder=/path/to/meshoptimizer/meshopt_encoder.module.js` (Meshoptimizer 0.25.0).
On the development machine this tool is installed under `F:/工具/foldscape-performance/node_modules/meshoptimizer/`.
Build with `npm run build`. Publish the matching HTML, JS, delivery GLBs and
gzip sidecars together. Do not delete old hashed files while cached HTML/JS
may still reference them. Include `npm run test:delivery` in validation.

## For the company's deployment engineer

Keep the existing site root/alias and subdirectory routing. Build for the
existing `/usercases/foldscape-memories/` base and ensure the project's existing
photo and source-asset path rewriting still runs. Include the new `delivery/`
directory in the same public mount. Verify the HTML preload and runtime device
request resolve to exactly the same URL, without redirects or duplicate loads.

Example directives for the EXISTING static delivery location (adapt to the
company's Nginx configuration; do not replace its root or alias blindly):

```nginx
gzip_static on;
gzip_vary on;
add_header Cache-Control "public, max-age=31536000, immutable";
```

`gzip_static` requires ngx_http_gzip_static_module. If unavailable, configure
the CDN/origin to compress `model/gltf-binary`, `model/gltf+json` and
`application/octet-stream`, or use its native precompressed-object support.
Do not apply immutable caching to index.html. Serve HTML with revalidation.
Keep correct GLB MIME types and use Vary: Accept-Encoding for compressed copies.

Check the final response with Accept-Encoding: gzip: status 200, correct
Content-Encoding, and transferred device bytes near 2.15 MB. Confirm repeat
loads use browser/CDN cache and check an uncached visitor near the target users.
A CDN close to users may reduce TTFB and improve throughput, but must be measured.

## Validation and remaining work

Six resource integrity tests compare every original non-image binary view,
nodes, meshes, skins, animations, materials and accessors with the delivery
version, and verify gzip round trips. Texture pixels are verified during
generation. Existing test suite and production build pass.

Browser automation was unavailable (request-header policy connection failure),
so no new browser frame-time or visual acceptance result is claimed. The
company's running deployment has not been modified. Re-measure cold-cache
first-visible-device and first-opened-scene after deployment; these are distinct
from HTTP download timings. Lighthouse is still 18.45 MB compressed: on a slow
connection further improvement requires a lighter delivery tier (texture
resolution/geometry budget), staged scene loading, or better delivery bandwidth.
Do not promise a fixed startup time based on this revision alone.

## Quality-first follow-up

The model is the advertised product. Do not adopt a size target by silently
reducing mesh density, texture resolution or material detail. This revision
does not apply lossy geometry/texture compression. Any later perceptual change
needs enlarged renders of all five scenes, including grazing light, reflections,
close-up details and folding transitions, before acceptance.

The device additionally ships a Brotli sidecar: 1,854,193 bytes, 13.7% smaller
than its gzip version and 62.1% below its original dependency total. The decoder
round trip is byte-identical. Use the hosting platform's Brotli static serving
with Accept-Encoding negotiation, Content-Encoding: br and Vary: Accept-Encoding;
retain gzip/uncompressed fallbacks. Nginx Brotli is an optional module, so do not
enable unsupported directives blindly. Local Vite preview does not serve these
sidecars automatically. No frontend motion or appearance changes are required.

Brotli was also measured on the scenes but not retained: the lighthouse saved
only 143,881 additional bytes over gzip (0.8%). This does not solve its startup
latency or establish a five-second loading guarantee.

## Background scene downloads

After the first scene has mounted, download the other four GLBs sequentially.
An explicit scene selection has queue priority and may start a second transfer
alongside the one already in progress. Total scene download concurrency is
limited to two, including rapid jumps; queued explicit selections prioritize
the latest request. In-flight and completed downloads are shared. Failed
background requests do not stall the queue and are retried on explicit selection.

The cache belongs to the mounted device, contains only the five known GLBs
(47,933,392 bytes in this delivery set), and is cleared on disposal. Downloads
are aborted when leaving. Background work does not instantiate meshes, decode
texture images or upload inactive models to the GPU. Switching still disposes
the previous render scene as before; revisiting avoids network transfer but
still parses the GLB, prepares layout and warms shaders. This is download
prefetching, not a promise that every switch renders instantly.

Validation includes queue/retry/disposal tests and an HTTP test serving all five
real delivery assets. Every scene is fetched once and repeated loads return the
same byte buffer without further HTTP requests. Browser timing remains pending
because the automation connection is unavailable.

## Vercel homepage follow-up

The supplied site https://foldscape-memories.vercel.app/ serves the expected
`index-Cmc5pIvY.js` build and preloads the packed device. Contrary to the earlier
company-host samples, Vercel DOES apply Brotli to the GLB response. One decoded
fetch took 10.11 s; a separate raw HTTP sample transferred 2,098,646 bytes in
7.18 s (TTFB 0.90 s). These are network samples, not first-visible timings.
The sampled edge was sfo1 and reported HIT. Device responses used max-age=0
with revalidation. Merely adding precompressed files did not guarantee a
five-second entrance. Download speed varied across requests.

The new device uses EXT_meshopt_compression with no quantization, filters,
reordering or triangle rotation. Every decoded buffer is compared byte-for-byte
with the source. The Three.js decoder is already supplied by the existing Three
dependency; the build-only encoder was downloaded to F:/工具 as requested.

| Device encoding | Previous | New |
| --- | ---: | ---: |
| GLB bytes | 4,762,092 | 2,407,684 |
| Gzip sidecar bytes | 2,148,123 | 1,788,253 |
| Brotli sidecar bytes | 1,854,193 | 1,707,076 |

25 precise fold-center samples are now baked into the asset instead of being
calculated on each visit. Tests compare all samples and skinned screen vertices
against the original rig at every sampled pose. Other models retain their exact
previous delivery files. Original files remain available for cached clients.

The device request starts before environment-map preparation, and the HTML
preload now explicitly requests high priority. Vercel receives immutable cache
headers only for content-hashed /delivery/ assets; index.html is unaffected.
This cache policy helps revisits, not a visitor's first download.

The device canvas exposes data-device-download-ms, data-device-parse-ms and
data-device-setup-ms durations, plus data-device-first-frame-ms and
data-device-visible-ms measured since navigation. Visible marks when the canvas
is allowed to enter; the CSS entrance still animates afterward. This telemetry
distinguishes transfer, decoding/setup and reveal gating on the next deployment.
No five-second end-to-end or visual browser verification is claimed until the
new production deployment can be measured.
