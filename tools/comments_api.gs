/**
 * Google Apps Script : Comments API backend for Tokyo Station Guide
 *
 * スポット（駅・スポット）へのユーザーコメントを Google Spreadsheet で管理
 *
 * デプロイ手順:
 * 1. Google Apps Script（script.google.com）で新規プロジェクト作成
 * 2. このコードをコピーして貼り付け
 * 3. 実行 → 承認（Google Sheets・ mail の権限許可）
 * 4. デプロイ → 新規デプロイ → ウェブアプリ（実行者: 自分、アクセス: 全員）
 * 5. デプロイID と URL をコピーして data/support.js に記載
 *
 * Spreadsheet 構造:
 * - "Comments" シート: spot_id, name, rating, text, visitDate, vid, timestamp, userAgent
 */

const SPREADSHEET_ID = ""; // 設定必須: Google Spreadsheet のID
const SHEET_NAME = "Comments";

// CORS対応ヘッダ
function setCors_(response) {
  return response
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// OPTIONS リクエスト (CORS preflight)
function doOptions(e) {
  return setCors_(ContentService.createTextOutput(""));
}

/**
 * GET: スポットのコメント一覧を取得
 * ?spotId=xxx&limit=10&offset=0
 */
function doGet(e) {
  if (!SPREADSHEET_ID) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "SPREADSHEET_ID not configured"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const spotId = e.parameter.spotId;
    const limit = parseInt(e.parameter.limit) || 10;
    const offset = parseInt(e.parameter.offset) || 0;

    if (!spotId) {
      return ContentService.createTextOutput(JSON.stringify({
        error: "spotId is required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        error: "Sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return setCors_(ContentService.createTextOutput(JSON.stringify({
        comments: [],
        total: 0
      }))).setMimeType(ContentService.MimeType.JSON);
    }

    const headers = data[0];
    const spotIdIdx = headers.indexOf("spot_id");
    const comments = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][spotIdIdx] === spotId) {
        comments.push({
          spotId: data[i][spotIdIdx],
          name: data[i][headers.indexOf("name")] || "匿名",
          rating: data[i][headers.indexOf("rating")] || 0,
          text: data[i][headers.indexOf("text")] || "",
          visitDate: data[i][headers.indexOf("visitDate")] || "",
          timestamp: data[i][headers.indexOf("timestamp")] || null,
          vid: data[i][headers.indexOf("vid")] || ""
        });
      }
    }

    // 新しい順ソート
    comments.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime() || 0;
      const bTime = new Date(b.timestamp).getTime() || 0;
      return bTime - aTime;
    });

    const total = comments.length;
    const paginated = comments.slice(offset, offset + limit);

    return setCors_(ContentService.createTextOutput(JSON.stringify({
      comments: paginated,
      total: total,
      limit: limit,
      offset: offset
    }))).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return setCors_(ContentService.createTextOutput(JSON.stringify({
      error: err.message
    }))).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POST: 新規コメントを投稿
 * body: { spotId, name, rating, text, visitDate, vid }
 */
function doPost(e) {
  if (!SPREADSHEET_ID) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "SPREADSHEET_ID not configured"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const postData = JSON.parse(e.postData.contents);

    // バリデーション
    const spotId = String(postData.spotId || "").trim();
    const name = String(postData.name || "匿名").trim().slice(0, 50);
    const rating = Math.min(5, Math.max(1, parseInt(postData.rating) || 0));
    const text = String(postData.text || "").trim().slice(0, 300);
    const visitDate = String(postData.visitDate || "").trim();
    const vid = String(postData.vid || "").trim();
    const honeypot = postData.honeypot; // スパム対策

    // ハニーポット (bot対策)
    if (honeypot) {
      return setCors_(ContentService.createTextOutput(JSON.stringify({
        error: "Spam detected"
      }))).setMimeType(ContentService.MimeType.JSON);
    }

    if (!spotId || !text) {
      return setCors_(ContentService.createTextOutput(JSON.stringify({
        error: "spotId and text are required"
      }))).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    // シートが無ければ作成
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      const headers = ["spot_id", "name", "rating", "text", "visitDate", "vid", "timestamp", "userAgent"];
      sheet.appendRow(headers);
    }

    // レート制限チェック (同一 vid から 60 秒以内の投稿は拒否)
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vidIdx = headers.indexOf("vid");
    const timestampIdx = headers.indexOf("timestamp");
    const now = new Date().getTime();
    const sixtySecAgo = now - 60 * 1000;

    if (vid) {
      let postCount = 0;
      for (let i = 1; i < data.length; i++) {
        if (data[i][vidIdx] === vid) {
          const ts = new Date(data[i][timestampIdx]).getTime() || 0;
          if (ts > sixtySecAgo) {
            return setCors_(ContentService.createTextOutput(JSON.stringify({
              error: "Too many requests. Wait 60 seconds before posting again."
            }))).setMimeType(ContentService.MimeType.JSON);
          }
          // その日のカウント
          const dateStr = new Date(ts).toISOString().slice(0, 10);
          const todayStr = new Date(now).toISOString().slice(0, 10);
          if (dateStr === todayStr) {
            postCount++;
          }
        }
      }

      // 1日10件の制限
      if (postCount >= 10) {
        return setCors_(ContentService.createTextOutput(JSON.stringify({
          error: "Daily limit exceeded (10 posts per day)"
        }))).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 新規行を追加
    const timestamp = new Date().toISOString();
    const userAgent = e.headers["User-Agent"] || "";
    sheet.appendRow([spotId, name, rating, text, visitDate, vid, timestamp, userAgent]);

    return setCors_(ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Comment posted successfully",
      timestamp: timestamp
    }))).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return setCors_(ContentService.createTextOutput(JSON.stringify({
      error: err.message
    }))).setMimeType(ContentService.MimeType.JSON);
  }
}
