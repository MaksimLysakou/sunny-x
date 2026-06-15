// One-time helper to obtain a Google OAuth refresh token for the Drive export
// step. Reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from .env.local, opens a
// local loopback server, prints a consent URL, and on callback exchanges the
// code for a refresh token which it prints (and writes back into .env.local).
//
//   node scripts/google-oauth.mjs
//
// Desktop-app OAuth clients allow http://localhost:<port> loopback redirects
// automatically, so no redirect URI needs to be configured in the console.

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { google } from "googleapis";

const ENV_PATH = new URL("../.env.local", import.meta.url);

function readEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return { raw, env };
}

const { raw, env } = readEnv();
const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}`;
const SCOPES = ["https://www.googleapis.com/auth/drive"];

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh_token even on re-auth
  scope: SCOPES,
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("No code in callback");
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    const refresh = tokens.refresh_token;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h2>Готово ✅</h2><p>Refresh token получен. Можно закрыть вкладку и вернуться в редактор.</p>",
    );

    if (refresh) {
      const next = raw.includes("GOOGLE_REFRESH_TOKEN=")
        ? raw.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${refresh}`)
        : `${raw.trimEnd()}\nGOOGLE_REFRESH_TOKEN=${refresh}\n`;
      writeFileSync(ENV_PATH, next);
      console.log("\n✅ Refresh token saved to .env.local\n");
      console.log("GOOGLE_REFRESH_TOKEN=" + refresh + "\n");
    } else {
      console.log(
        "\n⚠️  No refresh_token returned. Revoke prior access at " +
          "https://myaccount.google.com/permissions and re-run.\n",
      );
    }
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(authUrl + "\n");
  console.log(`Waiting for the callback on ${redirectUri} ...`);
});
