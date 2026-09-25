/**
 * TokyoStation v108 — Comments Module
 * Features: comments, image upload, likes
 */

(function(RG) {
  "use strict";

  // ================================================================================
  // Main HTML renderer
  // ================================================================================
  RG.commentsHTML = function(spotName, spotId) {
    return `
      <div class="comments" data-spot-id="${spotId}">
        <div class="comments__header">
          <h3>みんなの声 (${spotName})</h3>
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
            <textarea name="text" class="comments__textarea" placeholder="思ったことを書いてね（300字まで）" maxlength="300"></textarea>
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
    `;
  };

  // ================================================================================
  // Bind form and list handlers
  // ================================================================================
  RG.commentsBind = function(root) {
    const form = root.querySelector(".comments__form");
    const spotId = form.dataset.spotId;

    // Load existing comments
    RG.loadComments(spotId, root);

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
  };

  // ================================================================================
  // Load comments from API
  // ================================================================================
  RG.loadComments = function(spotId, root) {
    const apiEndpoint = RG.TIP?.commentsApi;
    if (!apiEndpoint) {
      root.querySelector(".comments__list").innerHTML =
        '<div class="comments__error">コメント機能が設定されていません</div>';
      return;
    }

    fetch(`${apiEndpoint}?spotId=${spotId}`)
      .then(res => res.json())
      .then(data => {
        if (data.comments && data.comments.length > 0) {
          RG.renderCommentsList(data.comments, root, spotId);
        } else {
          root.querySelector(".comments__list").innerHTML =
            '<div class="comments__empty">まだコメントがありません</div>';
        }
      })
      .catch(err => {
        Logger.log("Load comments error: " + err);
        root.querySelector(".comments__list").innerHTML =
          '<div class="comments__error">コメントの読み込みに失敗しました</div>';
      });
  };

  // ================================================================================
  // Render comments list
  // ================================================================================
  RG.renderCommentsList = function(comments, root, spotId) {
    const listContainer = root.querySelector(".comments__list");

    const html = comments.map(comment => {
      const date = new Date(comment.timestamp);
      const dateStr = date.toLocaleDateString("ja-JP");
      const rating = "★".repeat(comment.rating) + "☆".repeat(5 - comment.rating);

      return `
        <div class="comments__item" data-comment-id="${comment.commentId}">
          <div class="comments__item-header">
            <span class="comments__item-name">${escapeHtml(comment.name)}</span>
            <span class="comments__item-rating">${rating}</span>
            <span class="comments__item-date">${dateStr}</span>
          </div>

          ${comment.imageUrl ? `
            <div class="comments__item-image">
              <img src="${escapeHtml(comment.imageUrl)}" alt="ユーザー写真">
            </div>
          ` : ''}

          <div class="comments__item-text">${escapeHtml(comment.text)}</div>

          <div class="comments__item-footer">
            <button class="comments__like-btn" data-comment-id="${comment.commentId}" data-spot-id="${spotId}">
              ❤️ ${comment.likes}
            </button>
          </div>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = html;

    // Bind like buttons
    root.querySelectorAll(".comments__like-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        RG.likeComment(
          this.dataset.spotId,
          this.dataset.commentId,
          root
        );
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
        spotId: spotId,
        name: name,
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
  // Like comment
  // ================================================================================
  RG.likeComment = function(spotId, commentId, root) {
    const apiEndpoint = RG.TIP?.commentsApi;
    if (!apiEndpoint) return;

    // TODO: Implement like API endpoint in comments_api_v108.gs
    // For now, just show a message
    alert("いいね機能は近日実装予定です");
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})(window.RG = window.RG || {});
