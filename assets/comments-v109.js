/**
 * TokyoStation v109 — Comments Module
 * Features: comments, image upload, likes, user profiles, URL validation, sorting
 */

(function(RG) {
  "use strict";

  // ================================================================================
  // Main HTML renderer with sort UI
  // ================================================================================
  RG.commentsHTML = function(spotName, spotId) {
    return `
      <div class="comments" data-spot-id="${spotId}">
        <div class="comments__header">
          <h3>みんなの声 (${spotName})</h3>

          <!-- Sort UI -->
          <div class="comments__sort">
            <button class="comments__sort-btn comments__sort-btn--active" data-sort="likes" title="いいね順">
              ❤️ いいね順
            </button>
            <button class="comments__sort-btn" data-sort="newest" title="新しい順">
              🕐 新しい順
            </button>
            <button class="comments__sort-btn" data-sort="oldest" title="古い順">
              📅 古い順
            </button>
          </div>
        </div>

        <!-- Upload form -->
        <form class="comments__form" data-spot-id="${spotId}">
          <div class="comments__form-group">
            <label>名前（任意）</label>
            <input type="text" name="name" class="comments__input" placeholder="匿名でもOK" maxlength="50">
          </div>

          <div class="comments__form-group">
            <label>評価 ★</label>
            <div class="comments__rating">
              <label><input type="radio" name="rating" value="5"> ★★★★★</label>
              <label><input type="radio" name="rating" value="4"> ★★★★</label>
              <label><input type="radio" name="rating" value="3" checked> ★★★</label>
              <label><input type="radio" name="rating" value="2"> ★★</label>
              <label><input type="radio" name="rating" value="1"> ★</label>
            </div>
          </div>

          <div class="comments__form-group">
            <label>コメント</label>
            <textarea name="text" class="comments__textarea" placeholder="思ったことを書いてね。URLも貼れます（300字まで）" maxlength="300"></textarea>
            <div class="comments__counter">
              <span class="comments__char-count">0</span>/300
            </div>
          </div>

          <div class="comments__form-group">
            <label>写真（任意）</label>
            <input type="file" name="image" class="comments__file-input" accept="image/*">
            <div class="comments__preview-container" style="display:none;">
              <img class="comments__preview" style="max-width: 200px; max-height: 200px;">
            </div>
          </div>

          <div class="comments__form-group">
            <label>訪問日（任意）</label>
            <input type="date" name="visitDate" class="comments__input">
          </div>

          <button type="submit" class="comments__submit">投稿する</button>
          <div class="comments__status"></div>
        </form>

        <!-- Comments list -->
        <div class="comments__list">
          <div class="comments__loading">読み込み中...</div>
        </div>
      </div>

      <!-- User Profile Modal -->
      <div class="comments__profile-modal" style="display:none;">
        <div class="comments__profile-overlay"></div>
        <div class="comments__profile-content">
          <button class="comments__profile-close">✕</button>
          <div class="comments__profile-header">
            <h2 class="comments__profile-name">ユーザー名</h2>
            <p class="comments__profile-stat">投稿数: <span class="comments__profile-count">0</span></p>
            <p class="comments__profile-stat">参加日: <span class="comments__profile-date">-</span></p>
          </div>
          <div class="comments__profile-activity">
            <h3>この人の投稿</h3>
            <div class="comments__profile-list"></div>
          </div>
        </div>
      </div>
    `;
  };

  // ================================================================================
  // Bind form and list handlers
  // ================================================================================
  RG.commentsBind = function(root) {
    const form = root.querySelector(".comments__form");
    const spotId = form.dataset.spotId;
    let currentSort = "likes";  // Default sort

    // Load existing comments
    RG.loadComments(spotId, root, currentSort);

    // Image preview
    const fileInput = form.querySelector("input[name='image']");
    fileInput.addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          const preview = root.querySelector(".comments__preview");
          const container = root.querySelector(".comments__preview-container");
          preview.src = evt.target.result;
          container.style.display = "block";
        };
        reader.readAsDataURL(file);
      }
    });

    // Text counter
    const textarea = form.querySelector("textarea[name='text']");
    textarea.addEventListener("input", function() {
      root.querySelector(".comments__char-count").textContent = this.value.length;
    });

    // Form submit
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      RG.submitComment(spotId, form, root);
    });

    // Sort button handlers
    root.querySelectorAll(".comments__sort-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        // Update active state
        root.querySelectorAll(".comments__sort-btn").forEach(b => b.classList.remove("comments__sort-btn--active"));
        this.classList.add("comments__sort-btn--active");

        currentSort = this.dataset.sort;
        RG.loadComments(spotId, root, currentSort);
      });
    });

    // Profile modal close
    const modal = root.querySelector(".comments__profile-modal");
    const closeBtn = modal.querySelector(".comments__profile-close");
    const overlay = modal.querySelector(".comments__profile-overlay");

    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });

    overlay.addEventListener("click", () => {
      modal.style.display = "none";
    });
  };

  // ================================================================================
  // Load comments from API
  // ================================================================================
  RG.loadComments = function(spotId, root, sortType = "likes") {
    const apiEndpoint = RG.TIP?.commentsApi;
    if (!apiEndpoint) {
      root.querySelector(".comments__list").innerHTML =
        '<div class="comments__error">コメント機能が設定されていません</div>';
      return;
    }

    fetch(`${apiEndpoint}?action=getComments&spotId=${spotId}`)
      .then(res => res.json())
      .then(data => {
        if (data.comments && data.comments.length > 0) {
          RG.renderCommentsList(data.comments, root, spotId, sortType);
        } else {
          root.querySelector(".comments__list").innerHTML =
            '<div class="comments__empty">まだコメントがありません</div>';
        }
      })
      .catch(err => {
        console.log("Load comments error: " + err);
        root.querySelector(".comments__list").innerHTML =
          '<div class="comments__error">コメントの読み込みに失敗しました</div>';
      });
  };

  // ================================================================================
  // Render comments list with sorting and URL formatting
  // ================================================================================
  RG.renderCommentsList = function(comments, root, spotId, sortType = "likes") {
    const listContainer = root.querySelector(".comments__list");
    const vid = RG.getVid();

    // Sort comments
    let sortedComments = [...comments];
    if (sortType === "newest") {
      sortedComments.sort((a, b) => b.timestamp - a.timestamp);
    } else if (sortType === "oldest") {
      sortedComments.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      // likes (default)
      sortedComments.sort((a, b) => b.likes - a.likes || b.timestamp - a.timestamp);
    }

    const html = sortedComments.map(comment => {
      const date = new Date(comment.timestamp);
      const dateStr = date.toLocaleDateString("ja-JP");
      const rating = "★".repeat(comment.rating) + "☆".repeat(5 - comment.rating);

      // Format text with URL links
      let formattedText = escapeHtml(comment.text);
      if (comment.urls && comment.urls.length > 0) {
        comment.urls.forEach(url => {
          formattedText = formattedText.replace(
            url,
            `<a href="${escapeHtml(url)}" target="_blank" class="comments__url-link">🔗 link</a>`
          );
        });
      }

      // Check if user already liked
      const isLiked = comment.likeVids && comment.likeVids.includes(vid);
      const likeDisabled = isLiked ? 'disabled' : '';

      return `
        <div class="comments__item" data-comment-id="${comment.commentId}" data-vid="${comment.vid}">
          <div class="comments__item-header">
            <span class="comments__item-name comments__profile-link" data-vid="${comment.vid}" style="cursor:pointer;text-decoration:underline;color:#0066cc;">
              ${escapeHtml(comment.name)}
            </span>
            <span class="comments__item-rating">${rating}</span>
            <span class="comments__item-date">${dateStr}</span>
          </div>

          ${comment.imageUrl ? `
            <div class="comments__item-image">
              <img src="${escapeHtml(comment.imageUrl)}" alt="ユーザー写真" loading="lazy">
            </div>
          ` : ''}

          <div class="comments__item-text">${formattedText}</div>

          <div class="comments__item-footer">
            <button class="comments__like-btn ${isLiked ? 'comments__like-btn--liked' : ''}"
                    data-comment-id="${comment.commentId}"
                    data-spot-id="${spotId}"
                    ${likeDisabled}>
              ${isLiked ? '❤️' : '🤍'} ${comment.likes}
            </button>
          </div>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = html;

    // Bind like buttons
    root.querySelectorAll(".comments__like-btn").forEach(btn => {
      btn.addEventListener("click", function(e) {
        if (this.disabled) return;
        e.preventDefault();
        RG.likeComment(
          this.dataset.spotId,
          this.dataset.commentId,
          root,
          this
        );
      });
    });

    // Bind profile links
    root.querySelectorAll(".comments__profile-link").forEach(link => {
      link.addEventListener("click", function() {
        const vid = this.dataset.vid;
        const name = escapeHtml(this.textContent);
        RG.showUserProfile(vid, name, root);
      });
    });
  };

  // ================================================================================
  // Submit comment
  // ================================================================================
  RG.submitComment = function(spotId, form, root) {
    const apiEndpoint = RG.TIP?.commentsApi;
    if (!apiEndpoint) {
      alert("コメント機能が設定されていません");
      return;
    }

    const status = form.querySelector(".comments__status");
    const submitBtn = form.querySelector(".comments__submit");

    status.textContent = "送信中...";
    status.className = "comments__status comments__status--loading";
    submitBtn.disabled = true;

    // Build form data
    const name = form.querySelector("input[name='name']").value;
    const rating = form.querySelector("input[name='rating']:checked").value;
    const text = form.querySelector("textarea[name='text']").value;
    const visitDate = form.querySelector("input[name='visitDate']").value;
    const fileInput = form.querySelector("input[name='image']");

    let imageBase64 = null;

    // Convert image to base64 if present
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = function() {
        imageBase64 = reader.result.split(',')[1];
        sendCommentData();
      };
      reader.readAsDataURL(file);
    } else {
      sendCommentData();
    }

    function sendCommentData() {
      const payload = {
        action: "postComment",
        spotId: spotId,
        name: name || "匿名",
        rating: rating,
        text: text,
        visitDate: visitDate,
        vid: RG.getVid(),
        imageBase64: imageBase64
      };

      fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            status.textContent = "投稿しました！";
            status.className = "comments__status comments__status--success";
            form.reset();
            root.querySelector(".comments__char-count").textContent = "0";
            root.querySelector(".comments__preview-container").style.display = "none";

            // Reload comments after 1 second
            setTimeout(() => RG.loadComments(spotId, root), 1000);
          } else {
            throw new Error(data.error || "投稿に失敗しました");
          }
        })
        .catch(err => {
          status.textContent = "エラー: " + err.message;
          status.className = "comments__status comments__status--error";
        })
        .finally(() => {
          submitBtn.disabled = false;
        });
    }
  };

  // ================================================================================
  // Like comment with duplicate prevention
  // ================================================================================
  RG.likeComment = function(spotId, commentId, root, button) {
    const apiEndpoint = RG.TIP?.commentsApi;
    if (!apiEndpoint) return;

    const vid = RG.getVid();

    const payload = {
      action: "likeComment",
      spotId: spotId,
      commentId: commentId,
      vid: vid
    };

    fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Update button display
          button.classList.add("comments__like-btn--liked");
          button.innerHTML = `❤️ ${data.likes}`;
          button.disabled = true;
        } else {
          // Show error if already liked
          if (data.error && data.error.includes("Already")) {
            button.classList.add("comments__like-btn--liked");
            button.disabled = true;
          } else {
            alert(data.error || "いいねに失敗しました");
          }
        }
      })
      .catch(err => {
        console.log("Like error: " + err);
        alert("いいねに失敗しました");
      });
  };

  // ================================================================================
  // User Profile Modal
  // ================================================================================
  RG.showUserProfile = function(vid, name, root) {
    const apiEndpoint = RG.TIP?.commentsApi;
    if (!apiEndpoint) return;

    const modal = root.querySelector(".comments__profile-modal");
    const headerName = modal.querySelector(".comments__profile-name");
    const countSpan = modal.querySelector(".comments__profile-count");
    const dateSpan = modal.querySelector(".comments__profile-date");
    const listContainer = modal.querySelector(".comments__profile-list");

    // Show modal
    modal.style.display = "flex";

    // Fetch user profile
    fetch(`${apiEndpoint}?action=getUserProfile&vid=${vid}`)
      .then(res => res.json())
      .then(data => {
        const profile = data.profile || {};

        headerName.textContent = profile.name || name || "Anonymous";
        countSpan.textContent = profile.totalComments || 0;
        dateSpan.textContent = profile.joinDate ? new Date(profile.joinDate).toLocaleDateString("ja-JP") : "-";

        // Render activities
        if (profile.comments && profile.comments.length > 0) {
          const activityHtml = profile.comments.map((activity, idx) => `
            <div class="comments__activity-item">
              <span class="comments__activity-num">${idx + 1}.</span>
              <span class="comments__activity-text">投稿 #${activity.commentId ? activity.commentId.substring(0, 8) : 'unknown'}</span>
            </div>
          `).join('');
          listContainer.innerHTML = activityHtml;
        } else {
          listContainer.innerHTML = '<div class="comments__activity-empty">投稿がまだありません</div>';
        }
      })
      .catch(err => {
        console.log("Profile fetch error: " + err);
        listContainer.innerHTML = '<div class="comments__activity-error">プロフィール読み込みに失敗しました</div>';
      });
  };

  // ================================================================================
  // Visitor ID (localStorage-based)
  // ================================================================================
  RG.getVid = function() {
    const key = "tsg_visitor_id";
    let vid = localStorage.getItem(key);

    if (!vid) {
      vid = generateUuid();
      try {
        localStorage.setItem(key, vid);
      } catch (e) {
        // localStorage unavailable, use session-only
      }
    }

    return vid;
  };

  // ================================================================================
  // Utilities
  // ================================================================================
  function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})(window.RG = window.RG || {});
