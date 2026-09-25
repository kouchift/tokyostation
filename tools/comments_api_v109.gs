/**
 * TokyoStation v109 — Comments API with Firestore + Cloud Storage + Advanced Features
 * Features: text comments, image uploads, likes, URL validation, user profiles
 */

// Firebase configuration
const FIREBASE_PROJECT_ID = "tokyostation";
const FIREBASE_BUCKET = "tokyostation-images";

// Get API Key from Google Apps Script Properties (NOT hardcoded)
function getApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  if (!key) {
    throw new Error("FIREBASE_API_KEY not set. Please set it in Project Settings > Script Properties");
  }
  return key;
}

// Firestore API endpoint
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Spam keywords and URL shorteners
const SPAM_KEYWORDS = ["viagra", "casino", "lottery", "cryptocurrency", "bitcoin"];
const URL_SHORTENERS = ["bit.ly", "tinyurl", "goo.gl", "short.link", "ow.ly", "rebrand.ly", "cuttly.com"];

// ================================================================================
// GET: Load comments for a spot or user profile
// ================================================================================
function doGet(e) {
  const action = e.parameter.action || "getComments";

  try {
    if (action === "getComments") {
      const spotId = e.parameter.spotId;
      if (!spotId) {
        return sendJSON({ error: "spotId is required" }, 400);
      }
      const comments = getCommentsFromFirestore(spotId);
      return sendJSON({ success: true, comments: comments });

    } else if (action === "getUserProfile") {
      const vid = e.parameter.vid;
      if (!vid) {
        return sendJSON({ error: "vid is required" }, 400);
      }
      const profile = getUserProfileFromFirestore(vid);
      return sendJSON({ success: true, profile: profile });

    } else {
      return sendJSON({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    Logger.log("GET Error: " + error);
    return sendJSON({ error: error.toString() }, 500);
  }
}

// ================================================================================
// POST: Submit a comment with optional image and URL validation
// ================================================================================
function doPost(e) {
  const postData = JSON.parse(e.postData.contents);
  const action = postData.action || "postComment";

  try {
    if (action === "postComment") {
      return handlePostComment(postData);
    } else if (action === "likeComment") {
      return handleLikeComment(postData);
    } else {
      return sendJSON({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    Logger.log("POST Error: " + error);
    return sendJSON({ error: error.toString() }, 500);
  }
}

// ================================================================================
// POST handler: Comment submission
// ================================================================================
function handlePostComment(postData) {
  const spotId = postData.spotId;
  const name = postData.name || "匿名";
  const rating = parseInt(postData.rating) || 0;
  const text = postData.text || "";
  const visitDate = postData.visitDate || "";
  const vid = postData.vid || generateVid();
  const imageBase64 = postData.imageBase64 || null;

  // Validation
  if (!spotId || !text || text.length > 300 || text.length === 0) {
    return sendJSON({ error: "Invalid input" }, 400);
  }

  // URL and spam validation
  const urlValidation = validateAndExtractUrls(text);
  if (!urlValidation.valid) {
    return sendJSON({ error: urlValidation.error }, 400);
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
        urls: { arrayValue: { values: urlValidation.urls.map(u => ({ stringValue: u })) } },
        visitDate: { stringValue: visitDate },
        vid: { stringValue: vid },
        timestamp: { integerValue: timestamp },
        imageUrl: imageUrl ? { stringValue: imageUrl } : { nullValue: true },
        likes: { integerValue: 0 },
        likeVids: { arrayValue: { values: [] } },  // Track who liked
        userAgent: { stringValue: postData.userAgent || "" }
      }
    };

    // Write to Firestore
    const response = UrlFetchApp.fetch(
      `${FIRESTORE_URL}/spots/${spotId}/comments/${commentId}?key=${getApiKey()}`,
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

    // Save to user's activity profile (for user page timeline)
    saveUserActivity(vid, name, spotId, commentId, timestamp);

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
// POST handler: Like/Unlike comment
// ================================================================================
function handleLikeComment(postData) {
  const spotId = postData.spotId;
  const commentId = postData.commentId;
  const vid = postData.vid;

  if (!spotId || !commentId || !vid) {
    return sendJSON({ error: "Missing required fields" }, 400);
  }

  try {
    const url = `${FIRESTORE_URL}/spots/${spotId}/comments/${commentId}?key=${getApiKey()}`;

    // Get current comment
    const getResponse = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true
    });

    if (getResponse.getResponseCode() !== 200) {
      throw new Error("Comment not found");
    }

    const doc = JSON.parse(getResponse.getContentText());
    const currentLikes = parseInt(doc.fields?.likes?.integerValue || 0);
    const likeVids = doc.fields?.likeVids?.arrayValue?.values || [];
    const likeVidValues = likeVids.map(v => v.stringValue || "");

    // Check if already liked
    if (likeVidValues.includes(vid)) {
      return sendJSON({ error: "Already liked", likes: currentLikes }, 400);
    }

    // Add like
    likeVidValues.push(vid);
    const updateData = {
      fields: {
        likes: { integerValue: currentLikes + 1 },
        likeVids: { arrayValue: { values: likeVidValues.map(v => ({ stringValue: v })) } }
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

    return sendJSON({ success: true, likes: currentLikes + 1 });

  } catch (error) {
    Logger.log("Like error: " + error);
    return sendJSON({ error: error.toString() }, 500);
  }
}

// ================================================================================
// Firestore Helpers
// ================================================================================

function getCommentsFromFirestore(spotId) {
  const url = `${FIRESTORE_URL}/spots/${spotId}/comments?key=${getApiKey()}&pageSize=100`;

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
        const likeVids = fields.likeVids?.arrayValue?.values || [];
        return {
          commentId: fields.commentId?.stringValue || "",
          name: fields.name?.stringValue || "匿名",
          rating: parseInt(fields.rating?.integerValue || 0),
          text: fields.text?.stringValue || "",
          urls: fields.urls?.arrayValue?.values?.map(u => u.stringValue) || [],
          visitDate: fields.visitDate?.stringValue || "",
          timestamp: parseInt(fields.timestamp?.integerValue || 0),
          imageUrl: fields.imageUrl?.stringValue || null,
          likes: parseInt(fields.likes?.integerValue || 0),
          vid: fields.vid?.stringValue || "",
          likeVids: likeVids.map(v => v.stringValue || "")
        };
      })
      .sort((a, b) => b.likes - a.likes || b.timestamp - a.timestamp)  // Default: likes > newest
      .slice(0, 100);

  } catch (error) {
    Logger.log("Firestore fetch error: " + error);
    return [];
  }
}

function getUserProfileFromFirestore(vid) {
  try {
    // Query for all comments from this vid
    const url = `${FIRESTORE_URL}?key=${getApiKey()}&structuredQuery.from.collectionId=spots&structuredQuery.from.collectionId=comments&structuredQuery.where.fieldFilter.field.name=vid&structuredQuery.where.fieldFilter.value.stringValue=${vid}`;

    // Simplified: fetch from profile collection if it exists
    const profileUrl = `${FIRESTORE_URL}/profiles/${vid}?key=${getApiKey()}`;
    const response = UrlFetchApp.fetch(profileUrl, {
      method: "get",
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return { vid: vid, name: "Unknown", comments: [] };
    }

    const doc = JSON.parse(response.getContentText());
    const fields = doc.fields || {};

    return {
      vid: vid,
      name: fields.name?.stringValue || "Anonymous",
      totalComments: parseInt(fields.totalComments?.integerValue || 0),
      joinDate: fields.joinDate?.stringValue || "",
      comments: fields.comments?.arrayValue?.values || []
    };

  } catch (error) {
    Logger.log("Profile fetch error: " + error);
    return { vid: vid, name: "Unknown", comments: [] };
  }
}

function getLastCommentFromVid(spotId, vid) {
  const comments = getCommentsFromFirestore(spotId);
  return comments.find(c => c.vid === vid);
}

function getDailyCommentCountForVid(vid) {
  // Simplified implementation: would need cross-collection query
  // For production, implement proper daily count tracking
  return 0;
}

function saveUserActivity(vid, name, spotId, commentId, timestamp) {
  try {
    const profileUrl = `${FIRESTORE_URL}/profiles/${vid}?key=${getApiKey()}`;

    // Get or create profile
    const getResponse = UrlFetchApp.fetch(profileUrl, {
      method: "get",
      muteHttpExceptions: true
    });

    let profile = { name: name, totalComments: 0, joinDate: new Date().toISOString(), activities: [] };

    if (getResponse.getResponseCode() === 200) {
      const doc = JSON.parse(getResponse.getContentText());
      const fields = doc.fields || {};
      profile.name = fields.name?.stringValue || name;
      profile.totalComments = parseInt(fields.totalComments?.integerValue || 0);
      profile.joinDate = fields.joinDate?.stringValue || profile.joinDate;
      profile.activities = fields.activities?.arrayValue?.values || [];
    }

    // Add new activity
    profile.totalComments++;
    profile.activities.unshift({
      mapValue: {
        fields: {
          spotId: { stringValue: spotId },
          commentId: { stringValue: commentId },
          timestamp: { integerValue: timestamp }
        }
      }
    });

    // Keep only last 50 activities
    profile.activities = profile.activities.slice(0, 50);

    // Save profile
    const updateData = {
      fields: {
        name: { stringValue: profile.name },
        totalComments: { integerValue: profile.totalComments },
        joinDate: { stringValue: profile.joinDate },
        activities: { arrayValue: { values: profile.activities } }
      }
    };

    UrlFetchApp.fetch(profileUrl, {
      method: "patch",
      headers: { "Content-Type": "application/json" },
      payload: JSON.stringify(updateData),
      muteHttpExceptions: true
    });

  } catch (error) {
    Logger.log("Save activity error: " + error);
  }
}

// ================================================================================
// URL and Spam Validation
// ================================================================================

function validateAndExtractUrls(text) {
  // Check for spam keywords
  const lowerText = text.toLowerCase();
  for (let keyword of SPAM_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { valid: false, error: `Spam keywords detected: ${keyword}` };
    }
  }

  // Extract URLs
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = text.match(urlRegex) || [];

  // Validate each URL
  for (let url of urls) {
    const validation = validateUrl(url);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }
  }

  return { valid: true, urls: urls };
}

function validateUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Check for shorteners
    for (let shortener of URL_SHORTENERS) {
      if (domain.includes(shortener)) {
        return { valid: false, error: `URL shorteners not allowed: ${shortener}` };
      }
    }

    // Check for suspicious TLDs
    if (domain.match(/\.(tk|ml|ga|cf)$/i)) {
      return { valid: false, error: "Suspicious domain detected" };
    }

    return { valid: true };

  } catch (error) {
    return { valid: false, error: "Invalid URL format" };
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
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${FIREBASE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}&key=${getApiKey()}`;

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
// Utility functions
// ================================================================================

function generateVid() {
  // Generate unique visitor ID
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
