const $ = id => document.getElementById(id);

let currentAdmin = null;
let articles = [];
let categories = [];
let selectedBlockId = null;
let editingArticleId = null;

let blocks = [];


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      success: false,
      message: "Server trả về dữ liệu không hợp lệ."
    };
  }

  if (!response.ok) {
    throw new Error(
      data.message || "Request thất bại."
    );
  }

  return data;
}


/* =========================================================
   LOGIN
========================================================= */

async function checkLogin() {
  try {
    const data = await api("/api/admin/me");

    currentAdmin = data.admin;

    $("loginScreen").classList.add("hidden");
    $("adminApp").classList.remove("hidden");

    $("adminIdentity").textContent =
      `${currentAdmin.username} · ${currentAdmin.role}`;

    await loadEverything();

  } catch {
    $("loginScreen").classList.remove("hidden");
    $("adminApp").classList.add("hidden");
  }
}


$("loginForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    $("loginMessage").textContent =
      "Đang đăng nhập...";

    try {

      const data = await api(
        "/api/admin/login",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            username: $("username").value,
            password: $("password").value
          })
        }
      );

      currentAdmin = data.admin;

      $("loginScreen").classList.add("hidden");
      $("adminApp").classList.remove("hidden");

      $("adminIdentity").textContent =
        `${currentAdmin.username} · ${currentAdmin.role}`;

      await loadEverything();

    } catch (error) {

      $("loginMessage").textContent =
        error.message;
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

$("logoutButton").addEventListener(
  "click",
  async () => {

    try {
      await api(
        "/api/admin/logout",
        {
          method: "POST"
        }
      );
    } catch {}

    location.reload();
  }
);


/* =========================================================
   NAVIGATION
========================================================= */

const navButtons =
  document.querySelectorAll(".nav-button");

navButtons.forEach(button => {

  button.addEventListener(
    "click",
    () => {

      const page =
        button.dataset.page;

      navButtons.forEach(x =>
        x.classList.remove("active")
      );

      button.classList.add("active");

      document
        .querySelectorAll(".page")
        .forEach(x =>
          x.classList.remove("active-page")
        );

      const target =
        $(`page-${page}`);

      if (target) {
        target.classList.add("active-page");
      }

      $("pageTitle").textContent =
        button.textContent.trim();

      if (page === "articles") {
        loadArticles();
      }

      if (page === "media") {
        loadMedia();
      }

      if (page === "categories") {
        loadCategories();
      }

      if (page === "admins") {
        loadAdmins();
      }

      if (page === "theme") {
        loadTheme();
      }

      $("sidebar")?.classList.remove("open");
    }
  );
});


$("menuButton").addEventListener(
  "click",
  () => {
    document
      .querySelector(".sidebar")
      .classList.toggle("open");
  }
);


/* =========================================================
   LOAD EVERYTHING
========================================================= */

async function loadEverything() {

  await loadCategories();
  await loadArticles();
  await loadDashboard();

  if (currentAdmin.role === "super_admin") {
    await loadAdmins();
    await loadTheme();
  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  try {

    const data =
      await api("/api/admin/articles");

    const list =
      data.articles;

    $("statArticles").textContent =
      list.length;

    $("statPublished").textContent =
      list.filter(
        x => x.status === "published"
      ).length;

    $("statDrafts").textContent =
      list.filter(
        x => x.status === "draft"
      ).length;

    $("statViews").textContent =
      list.reduce(
        (sum, x) =>
          sum + Number(x.views || 0),
        0
      );

  } catch {}
}


/* =========================================================
   CATEGORIES
========================================================= */

async function loadCategories() {

  const data =
    await api("/api/categories");

  categories =
    data.categories;

  $("articleCategory").innerHTML =
    `<option value="">Không chọn</option>` +
    categories
      .map(
        category =>
          `<option value="${category.id}">
            ${escapeHtml(category.name)}
          </option>`
      )
      .join("");

  $("categoriesList").innerHTML =
    categories
      .map(
        category =>
          `
          <div class="simple-row">
            <strong>${escapeHtml(category.name)}</strong>
            <span>${escapeHtml(category.slug)}</span>
          </div>
          `
      )
      .join("");
}


$("createCategory").addEventListener(
  "click",
  async () => {

    const name =
      $("newCategoryName").value.trim();

    if (!name) {
      alert("Nhập tên chuyên mục.");
      return;
    }

    try {

      await api(
        "/api/categories",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            name
          })
        }
      );

      $("newCategoryName").value = "";

      await loadCategories();

      alert("Đã tạo chuyên mục.");

    } catch (error) {

      alert(error.message);
    }
  }
);


/* =========================================================
   ARTICLES
========================================================= */

async function loadArticles() {

  const data =
    await api("/api/admin/articles");

  articles =
    data.articles;

  renderArticles();
}


function renderArticles() {

  $("articlesList").innerHTML =
    articles
      .map(
        article =>
          `
          <div class="article-row">

            <div class="article-info">

              <strong>
                ${escapeHtml(article.title)}
              </strong>

              <small>
                ${escapeHtml(
                  article.category_name || "Chưa phân loại"
                )}
                ·
                ${escapeHtml(article.author || "")}
                ·
                ${article.views || 0} lượt xem
              </small>

              <span class="status ${article.status}">
                ${article.status}
              </span>

            </div>

            <div class="article-actions">

              <button
                class="secondary-button"
                onclick="editArticle(${article.id})"
              >
                Sửa
              </button>

              <button
                class="danger-button"
                onclick="deleteArticle(${article.id})"
              >
                Xóa
              </button>

            </div>

          </div>
          `
      )
      .join("");
}


window.editArticle = function(id) {

  const article =
    articles.find(
      x => Number(x.id) === Number(id)
    );

  if (!article) return;

  editingArticleId =
    article.id;

  $("editorTitle").textContent =
    "Sửa bài viết";

  $("articleTitle").value =
    article.title || "";

  $("articleExcerpt").value =
    article.excerpt || "";

  $("articleAuthor").value =
    article.author || "";

  $("articleTags").value =
    Array.isArray(article.tags)
      ? article.tags.join(", ")
      : "";

  $("articleCategory").value =
    article.category_id || "";

  blocks =
    Array.isArray(article.blocks)
      ? structuredClone(article.blocks)
      : [];

  selectedBlockId = null;

  renderCanvas();

  openPage("editor");
};


window.deleteArticle = async function(id) {

  if (
    !confirm(
      "Bạn chắc chắn muốn xóa bài viết này?"
    )
  ) {
    return;
  }

  try {

    await api(
      `/api/articles/${id}`,
      {
        method: "DELETE"
      }
    );

    await loadArticles();
    await loadDashboard();

  } catch (error) {

    alert(error.message);
  }
};


/* =========================================================
   NEW ARTICLE
========================================================= */

$("newArticleButton").addEventListener(
  "click",
  newArticle
);


function newArticle() {

  editingArticleId = null;

  $("editorTitle").textContent =
    "Soạn bài mới";

  $("articleTitle").value = "";
  $("articleExcerpt").value = "";
  $("articleAuthor").value =
    currentAdmin?.username || "";
  $("articleTags").value = "";
  $("articleCategory").value = "";

  blocks = [];

  selectedBlockId = null;

  renderCanvas();

  openPage("editor");
}


/* =========================================================
   EDITOR BLOCKS
========================================================= */

function createId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}


function baseBlock(type) {

  return {
    id: createId(),

    type,

    x: 5,
    y: 5,

    width: 40,
    height: 15,

    scale: 1,

    rotation: 0,

    fontSize: 18,

    text: ""
  };
}


$("addText").addEventListener(
  "click",
  () => {

    const block =
      baseBlock("text");

    block.text =
      "Nội dung văn bản...";

    block.width = 70;
    block.height = 18;

    blocks.push(block);

    selectedBlockId =
      block.id;

    renderCanvas();
  }
);


$("addHeading").addEventListener(
  "click",
  () => {

    const block =
      baseBlock("heading");

    block.text =
      "Tiêu đề phụ";

    block.fontSize = 30;

    block.width = 70;
    block.height = 14;

    blocks.push(block);

    selectedBlockId =
      block.id;

    renderCanvas();
  }
);


$("addQuote").addEventListener(
  "click",
  () => {

    const block =
      baseBlock("quote");

    block.text =
      "Trích dẫn...";

    block.fontSize = 20;

    block.width = 70;
    block.height = 18;

    blocks.push(block);

    selectedBlockId =
      block.id;

    renderCanvas();
  }
);


/* =========================================================
   ADD IMAGE
========================================================= */

$("addImage").addEventListener(
  "click",
  () => {

    const input =
      document.createElement("input");

    input.type = "file";

    input.accept =
      "image/jpeg,image/png,image/webp,image/gif";

    input.onchange =
      async () => {

        const file =
          input.files[0];

        if (!file) return;

        const form =
          new FormData();

        form.append(
          "file",
          file
        );

        try {

          const response =
            await fetch(
              "/api/media",
              {
                method: "POST",
                body: form,
                credentials: "same-origin"
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.message
            );
          }

          const block =
            baseBlock("image");

          block.url =
            data.url;

          block.width = 50;
          block.height = 30;

          blocks.push(block);

          selectedBlockId =
            block.id;

          renderCanvas();

        } catch (error) {

          alert(error.message);
        }
      };

    input.click();
  }
);


/* =========================================================
   RENDER CANVAS
========================================================= */

function renderCanvas() {

  const canvas =
    $("editorCanvas");

  canvas.innerHTML = "";

  blocks.forEach(
    block => {

      const element =
        document.createElement("div");

      element.className =
        "editor-block";

      if (
        block.id === selectedBlockId
      ) {
        element.classList.add("selected");
      }

      element.dataset.id =
        block.id;

      element.style.left =
        `${block.x}%`;

      element.style.top =
        `${block.y}%`;

      element.style.width =
        `${block.width}%`;

      element.style.height =
        `${block.height}%`;

      element.style.transform =
        `rotate(${block.rotation || 0}deg)`;

      if (block.type === "image") {

        const img =
          document.createElement("img");

        img.src =
          block.url;

        element.appendChild(img);

      } else {

        const content =
          document.createElement("div");

        if (block.type === "heading") {
          content.className =
            "block-heading";
        } else if (block.type === "quote") {
          content.className =
            "block-quote";
        } else {
          content.className =
            "block-text";
        }

        content.textContent =
          block.text || "";

        content.style.fontSize =
          `${block.fontSize || 18}px`;

        element.appendChild(content);
      }

      canvas.appendChild(element);

      attachDrag(element, block);
    }
  );

  updateSelectedControls();
}


/* =========================================================
   DRAG / TOUCH
========================================================= */

function attachDrag(element, block) {

  let dragging = false;

  let startX = 0;
  let startY = 0;

  let originalX = 0;
  let originalY = 0;

  element.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();

      selectedBlockId =
        block.id;

      renderCanvas();

      dragging = true;

      startX =
        event.clientX;

      startY =
        event.clientY;

      originalX =
        Number(block.x);

      originalY =
        Number(block.y);

      element.setPointerCapture?.(
        event.pointerId
      );
    }
  );

  element.addEventListener(
    "pointermove",
    event => {

      if (!dragging) return;

      const canvas =
        $("editorCanvas");

      const rect =
        canvas.getBoundingClientRect();

      const dx =
        event.clientX -
        startX;

      const dy =
        event.clientY -
        startY;

      const dxPercent =
        (dx / rect.width) * 100;

      const dyPercent =
        (dy / rect.height) * 100;

      block.x =
        clamp(
          originalX + dxPercent,
          0,
          100 - block.width
        );

      block.y =
        clamp(
          originalY + dyPercent,
          0,
          100 - block.height
        );

      element.style.left =
        `${block.x}%`;

      element.style.top =
        `${block.y}%`;
    }
  );

  element.addEventListener(
    "pointerup",
    () => {
      dragging = false;
    }
  );

  element.addEventListener(
    "pointercancel",
    () => {
      dragging = false;
    }
  );

  /*
     Double tap / double click
     để zoom ảnh
  */

  element.addEventListener(
    "dblclick",
    event => {

      event.preventDefault();

      if (block.type !== "image") {
        return;
      }

      block.scale =
        clamp(
          Number(block.scale || 1) + 0.15,
          0.2,
          5
        );

      renderCanvas();
    }
  );
}


/* =========================================================
   PINCH ZOOM
========================================================= */

let pinchState = null;

$("editorCanvas").addEventListener(
  "touchstart",
  event => {

    const touches =
      event.touches;

    if (touches.length !== 2) {
      return;
    }

    const selected =
      blocks.find(
        b => b.id === selectedBlockId
      );

    if (
      !selected ||
      selected.type !== "image"
    ) {
      return;
    }

    const distance =
      touchDistance(
        touches[0],
        touches[1]
      );

    pinchState = {
      distance,
      scale:
        Number(selected.scale || 1)
    };
  },
  { passive: true }
);


$("editorCanvas").addEventListener(
  "touchmove",
  event => {

    if (
      !pinchState ||
      event.touches.length !== 2
    ) {
      return;
    }

    const selected =
      blocks.find(
        b => b.id === selectedBlockId
      );

    if (!selected) return;

    const distance =
      touchDistance(
        event.touches[0],
        event.touches[1]
      );

    const ratio =
      distance /
      pinchState.distance;

    selected.scale =
      clamp(
        pinchState.scale * ratio,
        0.2,
        5
      );

    renderCanvas();
  },
  { passive: true }
);


$("editorCanvas").addEventListener(
  "touchend",
  () => {
    pinchState = null;
  }
);


function touchDistance(a, b) {

  const dx =
    a.clientX - b.clientX;

  const dy =
    a.clientY - b.clientY;

  return Math.sqrt(
    dx * dx + dy * dy
  );
}


/* =========================================================
   SELECTED BLOCK CONTROLS
========================================================= */

function getSelectedBlock() {

  return blocks.find(
    block =>
      block.id === selectedBlockId
  );
}


function updateSelectedControls() {

  const block =
    getSelectedBlock();

  if (!block) {
    return;
  }

  $("fontSizeControl").value =
    block.fontSize || 18;

  $("widthControl").value =
    block.width || 40;

  $("heightControl").value =
    block.height || 20;
}


$("fontSizeControl").addEventListener(
  "input",
  event => {

    const block =
      getSelectedBlock();

    if (!block) return;

    block.fontSize =
      clamp(
        Number(event.target.value),
        8,
        120
      );

    renderCanvas();
  }
);


$("widthControl").addEventListener(
  "input",
  event => {

    const block =
      getSelectedBlock();

    if (!block) return;

    block.width =
      clamp(
        Number(event.target.value),
        1,
        100
      );

    block.x =
      clamp(
        block.x,
        0,
        100 - block.width
      );

    renderCanvas();
  }
);


$("heightControl").addEventListener(
  "input",
  event => {

    const block =
      getSelectedBlock();

    if (!block) return;

    block.height =
      clamp(
        Number(event.target.value),
        1,
        100
      );

    block.y =
      clamp(
        block.y,
        0,
        100 - block.height
      );

    renderCanvas();
  }
);


$("deleteBlock").addEventListener(
  "click",
  () => {

    if (!selectedBlockId) {
      return;
    }

    blocks =
      blocks.filter(
        b => b.id !== selectedBlockId
      );

    selectedBlockId = null;

    renderCanvas();
  }
);


/* =========================================================
   SAVE / PUBLISH
========================================================= */

$("saveDraftButton").addEventListener(
  "click",
  () => saveArticle("draft")
);

$("publishButton").addEventListener(
  "click",
  () => saveArticle("published")
);


async function saveArticle(status) {

  const title =
    $("articleTitle").value.trim();

  if (!title) {
    alert("Bạn chưa nhập tiêu đề.");
    return;
  }

  const tags =
    $("articleTags").value
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  const payload = {

    title,

    excerpt:
      $("articleExcerpt").value.trim(),

    category_id:
      $("articleCategory").value
        ? Number(
            $("articleCategory").value
          )
   
