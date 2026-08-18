import http from "node:http";

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 8790;
const LISTEN_HOST = "0.0.0.0";
const LISTEN_PORT = 8080;

const server = http.createServer((req, res) => {
  const startedAt = Date.now();

  console.log(
    `[issuer-proxy] in ${new Date().toISOString()} from=${req.socket.remoteAddress} method=${req.method} url=${req.url} auth=${req.headers.authorization ? "yes" : "no"} ua=${req.headers["user-agent"] ?? ""}`,
  );

  const upstreamReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (upstreamRes) => {
      console.log(
        `[issuer-proxy] upstream status=${upstreamRes.statusCode} url=${req.url} ms=${Date.now() - startedAt}`,
      );

      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on("error", (error) => {
    console.log(
      `[issuer-proxy] upstream error url=${req.url} error=${error instanceof Error ? error.message : String(error)}`,
    );

    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: "issuer_proxy_upstream_error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  req.pipe(upstreamReq);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `D-Scope issuer proxy listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`,
  );
});
