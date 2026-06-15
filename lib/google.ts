import "server-only";
import { Readable } from "node:stream";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";

// Google Drive helpers for the article pipeline:
//   - downloadBriefText: fetch the ТЗ (and keys) doc as raw text (step 1)
//   - createArticleDoc:  import assembled HTML as a Google Doc in a folder (step 7)
//
// Auth is a one-time-authorized OAuth refresh token (see scripts/google-oauth.mjs),
// so all calls act as the user who owns the target Drive folder.

function getDrive(): drive_v3.Drive {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth env is incomplete (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)",
    );
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
}

/** Pull the Drive file ID out of a share/export URL or a bare ID. */
export function extractDriveFileId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  if (!s) return null;
  // /document/d/<id>, /spreadsheets/d/<id>, /file/d/<id>, /d/<id>
  const path = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (path) return path[1];
  // ?id=<id> or &id=<id>
  const q = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (q) return q[1];
  // bare id
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

/**
 * Download a ТЗ document as raw text. Google-native Docs/Sheets are exported to
 * text/csv; anything else is downloaded as-is and decoded utf-8. Throws a clear
 * error if the file is missing or inaccessible — caller stops the pipeline.
 */
export async function downloadBriefText(urlOrId: string): Promise<string> {
  const fileId = extractDriveFileId(urlOrId);
  if (!fileId) {
    throw new Error(`Не похоже на ссылку Google Docs/Drive: ${urlOrId}`);
  }

  const drive = getDrive();

  let mimeType: string | undefined;
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "mimeType,name",
      supportsAllDrives: true,
    });
    mimeType = meta.data.mimeType ?? undefined;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `ТЗ недоступно по ссылке (${msg}). Открой доступ «всем, у кого есть ссылка».`,
    );
  }

  try {
    if (mimeType === "application/vnd.google-apps.document") {
      const res = await drive.files.export(
        { fileId, mimeType: "text/plain" },
        { responseType: "text" },
      );
      return String(res.data);
    }
    if (mimeType === "application/vnd.google-apps.spreadsheet") {
      const res = await drive.files.export(
        { fileId, mimeType: "text/csv" },
        { responseType: "text" },
      );
      return String(res.data);
    }
    // Non-native file: download bytes and decode as text.
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer).toString("utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Не удалось скачать ТЗ (${msg}).`);
  }
}

export type CreatedDoc = { id: string; url: string };

/**
 * Import assembled HTML as a Google Doc inside the given folder. Google converts
 * HTML → Doc, so our `.doc-theme` styling and the remote <img> are preserved.
 */
export async function createArticleDoc(opts: {
  name: string;
  html: string;
  folderId: string;
}): Promise<CreatedDoc> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: opts.name,
      mimeType: "application/vnd.google-apps.document",
      parents: [opts.folderId],
    },
    media: {
      mimeType: "text/html",
      body: Readable.from([opts.html]),
    },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error("Drive не вернул id созданного документа");
  return {
    id,
    url: res.data.webViewLink ?? `https://docs.google.com/document/d/${id}/edit`,
  };
}
