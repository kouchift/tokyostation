/**
 * スポットコメント機能
 * - ユーザーがスポット（駅・施設）にコメント・評価を投稿
 * - 匿名可・300字・★1-5・訪問日記録・レート制限（60秒・1日10件）
 *
 * API: RG.COMMENTS = { endpoint: "https://..." }
 */

(function (RG) {
  "use strict";

  if (!RG) return;

  /**
   * コメント投稿パネルの HTML を生成
   */
  RG.commentsHTML = function (spotName, spotId) {
    if (!RG.COMMENTS || !RG.COMMENTS.endpoint) return "";

    return '<section class="comments">' +
      '<h3 class="comments__title">💬 みんなのコメント</h3>' +
      '<div class="comments__list" data-spot="' + RG.esc(spotId) + '"></div>' +
      '<form class="comments__form" data-spot="' + RG.esc(spotId) + '">' +
        '<fieldset>' +
          '<legend>コメントを投稿</legend>' +
          '<div class="comments__field">' +
            '<label>評価（1-5 ★）</label>' +
            '<div class="comments__rating">' +
              '<input type="radio" name="rating" value="1" id="r1"><label for="r1">★</label>' +
              '<input type="radio" name="rating" value="2" id="r2"><label for="r2">★★</label>' +
              '<input type="radio" name="rating" value="3" id="r3" checked><label for="r3">★★★</label>' +
              '<input type="radio" name="rating" value="4" id="r4"><label for="r4">★★★★</label>' +
              '<input type="radio" name="rating" value="5" id="r5"><label for="r5">★★★★★</label>' +
            '</div>' +
          '</div>' +
          '<div class="comments__field">' +
            '<label for="c-text">コメント（300字以内）</label>' +
            '<textarea id="c-text" name="text" maxlength="300" placeholder="訪問の感想や情報をお願いします…" required></textarea>' +
            '<span class="comments__counter"><span id="c-count">0</span>/300</span>' +
          '</div>' +
          '<div class="comments__field">' +
            '<label for="c-visit">訪問日（任意）</label>' +
            '<input type="date" id="c-visit" name="visitDate">' +
          '</div>' +
          '<div class="comments__field">' +
            '<label for="c-name">投稿者名（匿名でもOK・30字以内）</label>' +
            '<input type="text" id="c-name" name="name" maxlength="30" placeholder="匿名">' +
          '</div>' +
          '<div class="comments__honeypot">' +
            '<input type="email" name="honeypot" style="display:none" tabindex="-1">' +
          '</div>' +
          '<button type="submit" class="comments__submit">投稿する</button>' +
          '<div id="c-status" class="comments__status"></div>' +
        '</fieldset>' +
      '</form>' +
    '</section>';
  };

  /**
   * スポットコメント欄をバインド
   */
  RG.commentsBind = function (root) {
    if (!RG.COMMENTS || !RG.COMMENTS.endpoint) return;

    const forms = (root || document).querySelectorAll(".comments__form");
    if (!forms.length) return;

    forms.forEach(function (form) {
      const spotId = form.getAttribute("data-spot");
      if (!spotId) return;

      // テキストカウンタ
      const textarea = form.querySelector('textarea[name="text"]');
      const counter = form.querySelector("#c-count");
      if (textarea && counter) {
        textarea.addEventListener("input", function () {
          counter.textContent = this.value.length;
        });
      }

      // フォーム送信
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        RG.submitComment(spotId, form);
      });

      // コメント一覧を読み込み
      RG.loadComments(spotId, root);
    });
  };

  /**
   * 訪問者ID (端末固有の識別子)
   */
  RG.getVid = function () {
    if (!window.localStorage) return "";
    let vid = localStorage.getItem("tsg.vid");
    if (!vid) {
      vid = "v" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
      try {
        localStorage.setItem("tsg.vid", vid);
      } catch (e) {
        // storage quota exceeded または privacy mode
      }
    }
    return vid;
  };

  /**
   * コメント一覧を読み込み
   */
  RG.loadComments = function (spotId, root) {
    if (!RG.COMMENTS || !RG.COMMENTS.endpoint) return;

    const listEl = (root || document).querySelector('.comments__list[data-spot="' + RG.esc(spotId) + '"]');
    if (!listEl) return;

    const url = RG.COMMENTS.endpoint + "?spotId=" + encodeURIComponent(spotId) + "&limit=20";

    fetch(url, { mode: "cors" })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          listEl.innerHTML = '<p class="comments__empty">コメント読み込みエラー</p>';
          return;
        }

        const comments = data.comments || [];
        if (comments.length === 0) {
          listEl.innerHTML = '<p class="comments__empty">コメントはまだありません</p>';
          return;
        }

        const html = comments.map(c => RG.commentItemHTML(c)).join("");
        listEl.innerHTML = html;
      })
      .catch(err => {
        listEl.innerHTML = '<p class="comments__empty">読み込めませんでした</p>';
        console.error("Comments load error:", err);
      });
  };

  /**
   * コメント1件の HTML
   */
  RG.commentItemHTML = function (comment) {
    const stars = "★".repeat(comment.rating) + "☆".repeat(5 - comment.rating);
    const date = comment.visitDate ? "（" + comment.visitDate + "訪問）" : "";
    const ts = comment.timestamp ? new Date(comment.timestamp).toLocaleDateString("ja-JP") : "";

    return '<article class="comments__item">' +
      '<div class="comments__head">' +
        '<span class="comments__name">' + RG.esc(comment.name || "匿名") + '</span>' +
        '<span class="comments__rating">' + stars + '</span>' +
        '<time class="comments__date">' + ts + date + '</time>' +
      '</div>' +
      '<p class="comments__text">' + RG.esc(comment.text).replace(/\n/g, "<br>") + '</p>' +
    '</article>';
  };

  /**
   * コメント送信
   */
  RG.submitComment = function (spotId, form) {
    if (!RG.COMMENTS || !RG.COMMENTS.endpoint) return;

    const statusEl = form.querySelector("#c-status");
    const submitBtn = form.querySelector("button[type='submit']");

    const text = form.querySelector('textarea[name="text"]').value.trim();
    const rating = parseInt(form.querySelector('input[name="rating"]:checked').value) || 3;
    const visitDate = form.querySelector('input[name="visitDate"]').value || "";
    const name = form.querySelector('input[name="name"]').value.trim() || "匿名";
    const honeypot = form.querySelector('input[name="honeypot"]').value;

    // バリデーション
    if (!text) {
      RG.showCommentStatus(statusEl, "コメントを入力してください", "error");
      return;
    }

    if (honeypot) {
      RG.showCommentStatus(statusEl, "スパム対策により送信できません", "error");
      return;
    }

    // 送信開始
    submitBtn.disabled = true;
    RG.showCommentStatus(statusEl, "送信中…", "loading");

    const payload = {
      spotId: spotId,
      rating: rating,
      text: text,
      visitDate: visitDate,
      name: name,
      vid: RG.getVid()
    };

    fetch(RG.COMMENTS.endpoint, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        RG.showCommentStatus(statusEl, data.error, "error");
        submitBtn.disabled = false;
        return;
      }

      RG.showCommentStatus(statusEl, "投稿しました！ありがとうございます。", "ok");
      form.reset();
      form.querySelector("#c-count").textContent = "0";

      // 2秒後にコメント一覧を再読み込み
      setTimeout(function () {
        RG.loadComments(spotId, form.parentElement);
        submitBtn.disabled = false;
      }, 2000);
    })
    .catch(err => {
      console.error("Comment submit error:", err);
      RG.showCommentStatus(statusEl, "送信に失敗しました: " + err.message, "error");
      submitBtn.disabled = false;
    });
  };

  /**
   * ステータスメッセージ表示
   */
  RG.showCommentStatus = function (statusEl, message, type) {
    statusEl.textContent = message;
    statusEl.className = "comments__status comments__status--" + type;
    if (type === "ok" || type === "error") {
      setTimeout(function () {
        statusEl.textContent = "";
        statusEl.className = "comments__status";
      }, 4000);
    }
  };

  // グローバル初期化
  if (RG.on) {
    RG.on("mount", function () {
      RG.commentsBind();
    });
  }

})(window.RG);
