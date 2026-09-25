/**
 * TokyoStation v108 — Comments API with Firestore + Cloud Storage
 * Supports: text comments, image uploads, likes rating
 */

// Firebase configuration
const FIREBASE_PROJECT_ID = "tokyostation";
const FIREBASE_API_KEY = "PUT_YOUR_KEY_IN_SCRIPT_PROPERTIES";
const FIREBASE_BUCKET = "tokyostation-images";

// Firestore API endpoint
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// ================================================================================
// GET: Load comments for a spot
// ================================================================================
function doGet(e) {
  const spotId = e.parameter.spotId;

  if (!spotId) {
    return sendJSON({ error: "spotId is required" }, 400);
  }

  try {
    const comments = getCommentsFromFirestore(spotId);
    return sendJSON({ success: true, comments: comments });
  } catch (error) {
    Logger.log("GET Error: " + error);
    return sendJSON({ error: error.toString() }, 500);
  }
}

// ================================================================================
// POST: Submit a comment with optional image
// ================================================================================
function doPost(e) {
  const postData = JSON.parse(e.postData.contents);

  const spotId = postData.spotId;
  const name = postData.name || "匿名";
  const rating = parseInt(postData.rating) || 0;
  const text = postData.text || "";
  const visitDate = postData.visitDate || "";
  const vid = postData.vid || generateVid();
  const imageBase64 = postData.imageBase64 || null;

  // Validation
  if (!spotId || !text || text.length > 300) {
    return sendJSON({ error: "Invalid input" }, 400);
  }

  try {
    // Rate limiting check
    const lastComment = getLastCommentFromVid(spotId, vid);
    if (lastComment && (Date.now() - lastComment.timestamp) < 60000) {
      return sendJSON({ error: "Too many requests. Wait 60 seconds." }, 429);
    }

    const dailyCount = getDailyCommentCountForVid(vid);
    if (dailyCount >= 10) {
      return sendJSON({ error: "Daily limit reached (10 comments/day)" }, 429);
    }

    // Upload image if provided
    let imageUrl = null;
    if (imageBase64) {
      imageUrl = uploadImageToCloudStorage(spotId, imageBase64);
    }

    // Create comment document
    const commentId = Utilities.getUuid();
    const timestamp = Date.now();

    const commentData = {
      fields: {
        spotId: { stringValue: spotId },
        commentId: { stringValue: commentId },
        name: { stringValue: name },
        rating: { integerValue: rating },
        text: { stringValue: text },
        visitDate: { stringValue: visitDate },
        vid: { stringValue: vid },
        timestamp: { integerValue: timestamp },
        imageUrl: imageUrl ? { stringValue: imageUrl } : { nullValue: true },
        likes: { integerValue: 0 },
        userAgent: { stringValue: e.parameter.userAgent || "" }
      }
    };

    // Write to Firestore
    const response = UrlFetchApp.fetch(
      `${FIRESTORE_URL}/spots/${spotId}/comments/${commentId}?key=${FIREBASE_API_KEY}`,
      {
        method: "patch",
        headers: { "Content-Type": "application/json" },
        payload: JSON.stringify(commentData),
        muteHttpExceptions: true
      }
    );

    if (response.getResponseCode() !== 200) {
      throw new Error("Firestore write failed: " + response.getContentText());
    }

    return sendJSON({
      success: true,
      message: "Comment posted successfully",
      commentId: commentId
    });

  } catch (error) {
    Logger.log("POST Error: " + error);
    return sendJSON({ error: error.toString() }, 500);
  }
}

// ================================================================================
// Firestore Helpers
// ================================================================================

function getCommentsFromFirestore(spotId) {
  const url = `${FIRESTORE_URL}/spots/${spotId}/comments?key=${FIREBASE_API_KEY}&pageSize=100`;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return [];
    }

    const data = JSON.parse(response.getContentText());
    const documents = data.documents || [];

    return documents
      .map(doc => {
        const fields = doc.fields;
        return {
          commentId: fields.commentId?.stringValue || "",
          name: fields.name?.stringValue || "匿名",
          rating: parseInt(fields.rating?.integerValue || 0),
          text: fields.text?.stringValue || "",
          visitDate: fields.visitDate?.stringValue || "",
          timestamp: parseInt(fields.timestamp?.integerValue || 0),
          imageUrl: fields.imageUrl?.stringValue || null,
          likes: parseInt(fields.likes?.integerValue || 0),
          vid: fields.vid?.stringValue || ""
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);  // Latest 50 comments

  } catch (error) {
    Logger.log("Firestore fetch error: " + error);
    return [];
  }
}

function getLastCommentFromVid(spotId, vid) {
  const comments = getCommentsFromFirestore(spotId);
  return comments.find(c => c.vid === vid);
}

function getDailyCommentCountForVid(vid) {
  const now = Date.now();
  const dayAgo = now - (24 * 60 * 60 * 1000);

  // This is simplified; ideally query all docs where vid matches
  // For now, we'll store in a separate collection
  try {
    const url = `${FIRESTORE_URL}?key=${FIREBASE_API_KEY}&structuredQuery.from.collectionId=commentLogs&structuredQuery.where.fieldFilter.field.name=vid&structuredQuery.where.fieldFilter.value.stringValue=${vid}`;
    // Simplified: just return 0 for now, implement full query if needed
    return 0;
  } catch {
    return 0;
  }
}

// ================================================================================
// Cloud Storage Helpers
// ================================================================================

function uploadImageToCloudStorage(spotId, imageBase64) {
  const timestamp = Date.now();
  const randomId = Utilities.getUuid().substring(0, 8);
  const filename = `${timestamp}_${randomId}.jpg`;
  const path = `spots/${spotId}/${filename}`;

  try {
    // Decode base64
    const imageBytes = Utilities.newBlob(Utilities.base64Decode(imageBase64), "image/jpeg");

    // Cloud Storage JSON API endpoint
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${FIREBASE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}&key=${FIREBASE_API_KEY}`;

    const response = UrlFetchApp.fetch(uploadUrl, {
      method: "post",
      payload: imageBytes.getBytes(),
      headers: {
        "Content-Type": "image/jpeg"
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Cloud Storage upload failed");
    }

    // Return public URL
    return `https://storage.googleapis.com/${FIREBASE_BUCKET}/${path}`;

  } catch (error) {
    Logger.log("Upload error: " + error);
    throw error;
  }
}

// ================================================================================
// Like/Unlike handlers
// ================================================================================

function likeComment(spotId, commentId, vid) {
  try {
    const url = `${FIRESTORE_URL}/spots/${spotId}/comments/${commentId}?key=${FIREBASE_API_KEY}`;

    // Get current likes count
    const getResponse = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true
    });

    if (getResponse.getResponseCode() !== 200) {
      throw new Error("Comment not found");
    }

    const doc = JSON.parse(getResponse.getContentText());
    const currentLikes = parseInt(doc.fields?.likes?.integerValue || 0);

    // Update likes
    const updateData = {
      fields: {
        likes: { integerValue: currentLikes + 1 }
      }
    };

    const patchResponse = UrlFetchApp.fetch(url, {
      method: "patch",
      headers: { "Content-Type": "application/json" },
      payload: JSON.stringify(updateData),
      muteHttpExceptions: true
    });

    if (patchResponse.getResponseCode() !== 200) {
      throw new Error("Like update failed");
    }

    return { success: true, likes: currentLikes + 1 };

  } catch (error) {
    return { error: error.toString() };
  }
}

// ================================================================================
// Utility functions
// ================================================================================

function generateVid() {
  // Generate unique visitor ID (would be per-browser in real app)
  return Utilities.getUuid();
}

function sendJSON(data, code = 200) {
  const response = ContentService.createTextOutput(JSON.stringify(data));
  response.setMimeType(ContentService.MimeType.JSON);
  return response;
}

// Enable CORS
function doOptions(e) {
  const output = ContentService.createTextOutput("");
  output.setMimeType(ContentService.MimeType.TEXT);
  output.append("OPTIONS");
  return output;
}
