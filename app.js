const $ = id =>
  document.getElementById(id);


/* =========================================================
   API
========================================================= */

async function api(url) {

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Không thể tải dữ liệu."
    );
  }

  return data;
}


/* =========================================================
   SETTINGS
========================================================= */

async function loadSettings() {

  try {

    const data =
      await api("/api/settings");

    const s =
      data.settings;

    if (s.site_name) {
      document.title =
        s.site_name;
    }

    if (s.logo_text) {
      $("siteLogo").textContent =
        s.logo_text;
    }

    if (s.primary_color) {
      document.documentElement.style
        .setProperty(
          "--primary",
          s.primary_color
        );
    }

    if (s.accent_color) {
      document.documentElement.style
        .setProperty(
          "--accent",
          s.accent_color
        );
    }

    if (s.footer_text) {
      $("footerText").textContent =
        s.footer_text;
    }

  } catch {}
}


/* =========================================================
   CATEGORIES
========================================================= */

async function loadCategories() {

  const data =
    await api("/api/categories");

  $("categoryNav").innerHTML =
    `
      <a href="/">
        Tất cả
      </a>
    ` +
    data.categories
      .map(
        category =>
          `
          <a
            href="/?category=${encodeURIComponent(
              category.slug
            )}"
          >
            ${escapeHtml(category.name)}
          </a>
          `
      )
      .join("");
}


/* =========================================================
   HOME
========================================================= */

async function loadHome() {

  const params =
    new URLSearchParams(
      location.search
    );

  const category =
    params.get("category");

  const search =
    params.get("search");

  let url =
    "/api/articles";

  const query =
    new URLSearchParams();

  if (category) {
    query.set(
      "category",
      category
    );
  }

  if (search) {
    query.set(
      "search",
      search
    );
  }

  if (query.toString()) {
    url +=
      "?" + query.toString();
  }

  const data =
    await api(url);

  const articles =
    data.articles;

  renderFeatured(
    articles.filter(
      x => x.featured
    )
  );

  renderNews(
    articles
  );
}


/* =========================================================
   FEATURED
========================================================= */

function renderFeatured(articles) {

  const list =
    articles.length
      ? articles.slice(0, 4)
      : [];

  $("featuredGrid").innerHTML =
    list.length
      ? list
          .map(
            renderCard
          )
          .join("")
      : `
        <p>
          Chưa có tin nổi bật.
        </p>
      `;
}


/* =========================================================
   NEWS
========================================================= */

function renderNews(articles) {

  $("newsGrid").innerHTML =
    articles.length
      ? articles
          .map(
            renderCard
          )
          .join("")
      : `
        <p>
          Chưa có bài viết.
        </p>
      `;
}


function renderCard(article) {

  return `
    <article
      class="news-card"
      onclick="openArticle(${article.id})"
    >

      ${
        article.cover_url
          ? `
            <img
              class="news-card-image"
              src="${article.cover_url}"
              alt=""
              loading="lazy"
            >
          `
          : `
            <div
              class="news-card-image"
            ></div>
          `
      }

      <div class="news-card-body">

        <div class="news-card-category">
          ${escapeHtml(
            article.category_name ||
            "Tin tức"
          )}
        </div>

        <div class="news-card-title">
          ${escapeHtml(
            article.title
          )}
        </div>

        ${
          article.excerpt
            ? `
              <div
                class="news-card-excerpt"
              >
                ${escapeHtml(
                  article.excerpt
                )}
              </div>
            `
            : ""
        }

        <div class="news-card-meta">

          ${
            article.author
              ? escapeHtml(
                  article.author
                )
              : ""
          }

          ·

          ${formatDate(
            article.published_at ||
            article.created_at
          )}

        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   ARTICLE
========================================================= */

window.openArticle =
  async function(id) {

    try {

      const data =
        await api(
          `/api/articles/${id}`
        );

      const article =
        data.article;

      $("homeView")
        .classList.add("hidden");

      $("articleView")
        .classList.remove("hidden");

      renderArticle(
        article
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    } catch (error) {

      alert(error.message);
    }
  };


function renderArticle(article) {

  const blocks =
    Array.isArray(article.blocks)
      ? article.blocks
      : [];

  $("articleContainer").innerHTML =
    `
      <div class="article-category">
        ${escapeHtml(
          article.category_name ||
          "Tin tức"
        )}
      </div>

      <h1 class="article-title">
        ${escapeHtml(
          article.title
        )}
      </h1>

      <div class="article-meta">
        ${escapeHtml(
          article.author || ""
        )}
        ·
        ${formatDate(
          article.published_at ||
          article.created_at
        )}
        ·
        ${article.views || 0} lượt xem
      </div>

      ${
        article.cover_url
          ? `
            <img
              class="article-cover"
              src="${article.cover_url}"
              alt=""
            >
          `
          : ""
      }

      <div
        id="publicCanvas"
        class="article-canvas"
      ></div>
    `;


  const canvas =
    $("publicCanvas");


  blocks.forEach(
    block => {

      const element =
        document.createElement("div");

      element.className =
        "public-block";

      /*
        Đây chính là dữ liệu Admin
        đã lưu.

        Admin đặt bên phải:
        x = 70

        Người đọc:
        left = 70%
      */

      element.style.left =
        `${block.x}%`;

      element.style.top =
        `${block.y}%`;

      element.style.width =
        `${block.width}%`;

      element.style.height =
        `${block.height}%`;

      element.style.transform =
        `rotate(${block.rotation || 0}deg)
         scale(${block.scale || 1})`;

      if (
        block.type === "image"
      ) {

        const img =
          document.createElement("img");

        img.src =
          block.url;

        img.alt = "";

        element.appendChild(
          img
        );

      } else {

        const content =
          document.createElement("div");

        if (
          block.type ===
          "heading"
        ) {

          content.className =
            "public-heading";

        } else if (
          block.type ===
          "quote"
        ) {

          content.className =
            "public-quote";

        } else {

          content.className =
            "public-text";
        }

        content.textContent =
          block.text || "";

        content.style.fontSize =
          `${block.fontSize || 18}px`;

        element.appendChild(
          content
        );
      }

      canvas.appendChild(
        element
      );
    }
  );
}


/* =========================================================
   SEARCH
========================================================= */

$("searchButton").addEventListener(
  "click",
  () => {

    $("searchOverlay")
      .classList.remove("hidden");

    $("searchInput")
      .focus();
  }
);


$("closeSearch").addEventListener(
  "click",
  () => {

    $("searchOverlay")
      .classList.add("hidden");
  }
);


$("doSearch").addEventListener(
  "click",
  () => {

    const q =
      $("searchInput")
        .value
        .trim();

    if (!q) return;

    location.href =
      `/?search=${encodeURIComponent(q)}`;
  }
);


$("searchInput").addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
      "Enter"
    ) {

      $("doSearch")
        .click();
    }
  }
);


/* =========================================================
   LOCAL PREVIEW
========================================================= */

function loadLocalPreview() {

  const params =
    new URLSearchParams(
      location.search
    );

  if (
    params.get("preview") !==
    "local"
  ) {
    return false;
  }

  const raw =
    localStorage.getItem(
      "kaisoul_preview"
    );

  if (!raw) {
    return false;
  }

  try {

    const data =
      JSON.parse(raw);

    $("homeView")
      .classList.add("hidden");

    $("articleView")
      .classList.remove("hidden");

    renderArticle({
      title:
        data.title,

      excerpt:
        data.excerpt,

      category_name:
        "Xem trước",

      author:
        "Admin",

      created_at:
        new Date().toISOString(),

      views:
        0,

      blocks:
        data.blocks,

      cover_url:
        ""
    });

    return true;

  } catch {

    return false;
  }
}


/* =========================================================
   UTILITIES
========================================================= */

function escapeHtml(value) {

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function formatDate(value) {

  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleString(
    "vi-VN",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );
}


/* =========================================================
   START
========================================================= */

(async function() {

  await loadSettings();

  await loadCategories();

  if (
    !loadLocalPreview()
  ) {

    try {
      await loadHome();
    } catch (error) {

      console.error(error);

      $("newsGrid").innerHTML =
        `
        <p>
          Không thể tải tin tức.
        </p>
        `;
    }
  }

})();
