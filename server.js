require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(ROOT));

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "7d"
  })
);

/* =========================================================
   DATABASE
========================================================= */

const db = new sqlite3.Database(
  path.join(DATA_DIR, "kaisoul-news.db")
);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({
        id: this.lastID,
        changes: this.changes
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(admin_id) REFERENCES admins(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      category_id INTEGER,
      author TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      blocks TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      featured INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      url TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  /* -----------------------------------------
     DEFAULT CATEGORIES
  ----------------------------------------- */

  const categories = [
    ["Việt Nam", "viet-nam"],
    ["Thế giới", "the-gioi"],
    ["Thể thao", "the-thao"],
    ["Công nghệ", "cong-nghe"],
    ["Giải trí", "giai-tri"],
    ["Kinh tế", "kinh-te"],
    ["Khoa học", "khoa-hoc"],
    ["Đời sống", "doi-song"]
  ];

  for (const [name, slug] of categories) {
    await run(
      `
      INSERT OR IGNORE INTO categories
      (name, slug, created_at)
      VALUES (?, ?, ?)
      `,
      [name, slug, new Date().toISOString()]
    );
  }

  /* -----------------------------------------
     DEFAULT SETTINGS
  ----------------------------------------- */

  const defaultSettings = {
    site_name: "KAISOUL NEWS",
    site_description: "Tin tức mới nhất",
    primary_color: "#111111",
    accent_color: "#ff3040",
    font_family: "system",
    logo_text: "KAISOUL NEWS",
    footer_text: "© KAISOUL NEWS"
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await run(
      `
      INSERT OR IGNORE INTO settings
      (key, value)
      VALUES (?, ?)
      `,
      [key, value]
    );
  }

  /* -----------------------------------------
     CREATE FIRST ADMIN
  ----------------------------------------- */

  const adminCount = await get(
    `SELECT COUNT(*) AS count FROM admins`
  );

  if (adminCount.count === 0) {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;

    if (!username || !password) {
      throw new Error(
        "ADMIN_USERNAME và ADMIN_PASSWORD chưa được cấu hình trong .env"
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await run(
      `
      INSERT INTO admins
      (username, password_hash, role, created_at)
      VALUES (?, ?, 'super_admin', ?)
      `,
      [
        username,
        passwordHash,
        new Date().toISOString()
      ]
    );

    console.log("First Super Admin created.");
  }

  console.log("Database initialized.");
}

/* =========================================================
   HELPERS
========================================================= */

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function makeSlug(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function validStatus(status) {
  return ["draft", "published", "archived"].includes(status);
}

function validateBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return false;
  }

  if (blocks.length > 200) {
    return false;
  }

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      return false;
    }

    if (!["text", "image", "heading", "quote", "video"].includes(block.type)) {
      return false;
    }

    const x = Number(block.x);
    const y = Number(block.y);
    const width = Number(block.width);
    const height = Number(block.height);
    const scale = Number(block.scale);
    const rotation = Number(block.rotation);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(scale) ||
      !Number.isFinite(rotation)
    ) {
      return false;
    }

    if (width <= 0 || width > 100) {
      return false;
    }

    if (height <= 0 || height > 100) {
      return false;
    }

    if (scale <= 0 || scale > 10) {
      return false;
    }

    if (Math.abs(rotation) > 360) {
      return false;
    }

    if (block.type === "text" || block.type === "heading" || block.type === "quote") {
      if (typeof block.text !== "string") {
        return false;
      }

      if (block.text.length > 20000) {
        return false;
      }
    }

    if (block.type === "image") {
      if (typeof block.url !== "string") {
        return false;
      }
    }
  }

  return true;
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function getAdminFromRequest(req) {
  const token = req.cookies.kaisoul_admin_session;

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const row = await get(
    `
    SELECT
      admins.id,
      admins.username,
      admins.role,
      sessions.expires_at
    FROM sessions
    JOIN admins
      ON admins.id = sessions.admin_id
    WHERE sessions.token_hash = ?
    `,
    [tokenHash]
  );

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at) < new Date()) {
    await run(
      `DELETE FROM sessions WHERE token_hash = ?`,
      [tokenHash]
    );

    return null;
  }

  return row;
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await getAdminFromRequest(req);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập Admin."
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Lỗi xác thực."
    });
  }
}

async function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền Super Admin."
    });
  }

  next();
}

/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post("/api/admin/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tài khoản và mật khẩu."
      });
    }

    const admin = await get(
      `
      SELECT *
      FROM admins
      WHERE username = ?
      `,
      [username]
    );

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Sai tài khoản hoặc mật khẩu."
      });
    }

    const correct = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!correct) {
      return res.status(401).json({
        success: false,
        message: "Sai tài khoản hoặc mật khẩu."
      });
    }

    const token = crypto.randomBytes(48).toString("hex");
    const tokenHash = hashToken(token);

    const expires = new Date(
      Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    );

    await run(
      `
      INSERT INTO sessions
      (admin_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      `,
      [
        admin.id,
        tokenHash,
        expires.toISOString(),
        new Date().toISOString()
      ]
    );

    res.cookie(
      "kaisoul_admin_session",
      token,
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
        path: "/"
      }
    );

    res.json({
      success: true,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Không thể đăng nhập."
    });
  }
});

/* =========================================================
   ADMIN LOGOUT
========================================================= */

app.post("/api/admin/logout", requireAdmin, async (req, res) => {
  const token = req.cookies.kaisoul_admin_session;

  if (token) {
    await run(
      `DELETE FROM sessions WHERE token_hash = ?`,
      [hashToken(token)]
    );
  }

  res.clearCookie("kaisoul_admin_session");

  res.json({
    success: true
  });
});

/* =========================================================
   CURRENT ADMIN
========================================================= */

app.get("/api/admin/me", requireAdmin, async (req, res) => {
  res.json({
    success: true,
    admin: {
      id: req.admin.id,
      username: req.admin.username,
      role: req.admin.role
    }
  });
});

/* =========================================================
   CATEGORIES - PUBLIC
========================================================= */

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await all(
      `
      SELECT *
      FROM categories
      ORDER BY name ASC
      `
    );

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Không thể tải chuyên mục."
    });
  }
});

/* =========================================================
   CATEGORIES - ADMIN CREATE
========================================================= */

app.post(
  "/api/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();

      if (!name || name.length > 80) {
        return res.status(400).json({
          success: false,
          message: "Tên chuyên mục không hợp lệ."
        });
      }

      const slug = makeSlug(name);

      const result = await run(
        `
        INSERT INTO categories
        (name, slug, created_at)
        VALUES (?, ?, ?)
        `,
        [
          name,
          slug,
          new Date().toISOString()
        ]
      );

      res.json({
        success: true,
        id: result.id
      });
    } catch (error) {
      if (error.message.includes("UNIQUE")) {
        return res.status(409).json({
          success: false,
          message: "Chuyên mục đã tồn tại."
        });
      }

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Không thể tạo chuyên mục."
      });
    }
  }
);

/* =========================================================
   PUBLIC ARTICLES
========================================================= */

app.get("/api/articles", async (req, res) => {
  try {
    const category = String(req.query.category || "").trim();
    const search = String(req.query.search || "").trim();
    const featured = req.query.featured === "1";

    let sql = `
      SELECT
        articles.*,
        categories.name AS category_name,
        categories.slug AS category_slug
      FROM articles
      LEFT JOIN categories
        ON categories.id = articles.category_id
      WHERE articles.status = 'published'
    `;

    const params = [];

    if (category) {
      sql += ` AND categories.slug = ? `;
      params.push(category);
    }

    if (search) {
      sql += `
        AND (
          articles.title LIKE ?
          OR articles.excerpt LIKE ?
        )
      `;

      const q = `%${search}%`;

      params.push(q, q);
    }

    if (featured) {
      sql += ` AND articles.featured = 1 `;
    }

    sql += `
      ORDER BY
        COALESCE(articles.published_at, articles.created_at) DESC
      LIMIT 100
    `;

    const articles = await all(sql, params);

    for (const article of articles) {
      article.tags = JSON.parse(article.tags || "[]");
      article.blocks = JSON.parse(article.blocks || "[]");
    }

    res.json({
      success: true,
      articles
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Không thể tải bài viết."
    });
  }
});

/* =========================================================
   SINGLE PUBLIC ARTICLE
========================================================= */

app.get("/api/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "ID không hợp lệ."
      });
    }

    const article = await get(
      `
      SELECT
        articles.*,
        categories.name AS category_name,
        categories.slug AS category_slug
      FROM articles
      LEFT JOIN categories
        ON categories.id = articles.category_id
      WHERE articles.id = ?
      AND articles.status = 'published'
      `,
      [id]
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết."
      });
    }

    await run(
      `
      UPDATE articles
      SET views = views + 1
      WHERE id = ?
      `,
      [id]
    );

    article.tags = JSON.parse(article.tags || "[]");
    article.blocks = JSON.parse(article.blocks || "[]");

    res.json({
      success: true,
      article
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Không thể tải bài viết."
    });
  }
});

/* =========================================================
   ADMIN ARTICLES
========================================================= */

app.get(
  "/api/admin/articles",
  requireAdmin,
  async (req, res) => {
    try {
      const articles = await all(
        `
        SELECT
          articles.*,
          categories.name AS category_name
        FROM articles
        LEFT JOIN categories
          ON categories.id = articles.category_id
        ORDER BY articles.updated_at DESC
        `
      );

      for (const article of articles) {
        article.tags = JSON.parse(article.tags || "[]");
        article.blocks = JSON.parse(article.blocks || "[]");
      }

      res.json({
        success: true,
        articles
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Không thể tải danh sách bài."
      });
    }
  }
);

/* =========================================================
   CREATE ARTICLE
========================================================= */

app.post(
  "/api/articles",
  requireAdmin,
  async (req, res) => {
    try {
      const title = String(req.body.title || "").trim();
      const excerpt = String(req.body.excerpt || "").trim();
      const author = String(
        req.body.author || req.admin.username
      ).trim();

      const categoryId = req.body.category_id
        ? Number(req.body.category_id)
        : null;

      const status = String(
        req.body.status || "draft"
      );

      const featured = req.body.featured ? 1 : 0;

      let tags = req.body.tags || [];

      if (typeof tags === "string") {
        try {
          tags = JSON.parse(tags);
        } catch {
          tags = tags
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);
        }
      }

      const blocks = req.body.blocks || [];

      if (!title || title.length > 300) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không hợp lệ."
        });
      }

      if (!validStatus(status)) {
        return res.status(400).json({
          success: false,
          message: "Trạng thái không hợp lệ."
        });
      }

      if (!Array.isArray(tags) || tags.length > 30) {
        return res.status(400).json({
          success: false,
          message: "Tags không hợp lệ."
        });
      }

      if (!validateBlocks(blocks)) {
        return res.status(400).json({
          success: false,
          message: "Dữ liệu Editor không hợp lệ."
        });
      }

      let slug = makeSlug(title);

      const existing = await get(
        `SELECT id FROM articles WHERE slug = ?`,
        [slug]
      );

      if (existing) {
        slug += "-" + Date.now();
      }

      const now = new Date().toISOString();

      const publishedAt =
        status === "published"
          ? now
          : null;

      const result = await run(
        `
        INSERT INTO articles
        (
          title,
          slug,
          excerpt,
          cover_url,
          category_id,
          author,
          tags,
          blocks,
          status,
          featured,
          views,
          created_at,
          updated_at,
          published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `,
        [
          title,
          slug,
          excerpt,
          String(req.body.cover_url || ""),
          categoryId,
  
