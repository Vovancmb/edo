import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

import db from './db.js';
import {
  hashPassword, verifyPassword, generateKeyPair,
  encryptPrivateKey, decryptPrivateKey, signData
} from './crypto.js';

const execFileP = promisify(execFile);
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = process.env.DATA_DIR || '/data';
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PREVIEW_DIR= path.join(DATA_DIR, 'previews');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT       = process.env.PORT || 3000;
const FONT_PATH  = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://onlyoffice.a22mail.ru').replace(/\/+$/, '');

/**
 * Корректная отдача файла с кириллицей в имени (RFC 5987).
 * filename= — ASCII fallback для старых браузеров.
 * filename*=UTF-8''... — правильное имя для современных.
 */
function sendDownload(res, filePath, filename) {
  const safeName = String(filename || 'document').replace(/[\r\n"\\]/g, '_');
  // ASCII-fallback: если есть кириллица — используем 'document' + расширение
  const dotIdx = safeName.lastIndexOf('.');
  const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
  const isAscii = /^[\x20-\x7E]+$/.test(safeName);
  const fallback = isAscii ? safeName : ('document' + ext);
  const encoded = encodeURIComponent(safeName);
  res.setHeader('Content-Disposition',
    `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
  res.sendFile(path.resolve(filePath));
}


/**
 * Исправляет имя файла, испорченное multer (UTF-8 → Latin-1).
 * Пример: 'ÐÐ¤Ð£.pdf' → 'МФУ.pdf'
 */
function fixFilename(name) {
  if (!name) return name;
  try {
    const decoded = Buffer.from(String(name), 'latin1').toString('utf8');
    // Проверка: если результат содержит кириллицу, значит перекодировка удалась
    if (/[А-Яа-яЁё]/.test(decoded)) return decoded;
  } catch (e) {}
  return name;
}

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10);
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 30 * 1024 * 1024 }
});

function auth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT id, username, full_name, is_admin FROM users WHERE id = ?').get(p.uid);
    if (!u) return res.status(401).json({ error: 'Не авторизован' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Сессия истекла' }); }
}

function requireAdmin(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Только для администратора' });
  next();
}

function notify(userId, documentId, type, message, annotationId = null) {
  db.prepare('INSERT INTO notifications (user_id, document_id, type, message, annotation_id) VALUES (?, ?, ?, ?, ?)')
    .run(userId, documentId, type, message, annotationId);
}

async function generatePreviews(docId, filePath, mime) {
  const outDir = path.join(PREVIEW_DIR, String(docId));
  fs.mkdirSync(outDir, { recursive: true });

  if (mime === 'application/pdf') {
    await execFileP('pdftoppm', ['-png', '-r', '110', filePath, path.join(outDir, 'page')]);
    const files = fs.readdirSync(outDir).filter(f => /^page.*\.png$/.test(f));
    let maxPage = 0;
    for (const f of files) {
      const m = f.match(/-(\d+)\.png$/);
      const n = m ? parseInt(m[1], 10) : 1;
      const target = `page-${n}.png`;
      if (f !== target) {
        const src = path.join(outDir, f);
        const dst = path.join(outDir, target);
        if (fs.existsSync(dst)) fs.unlinkSync(dst);
        fs.renameSync(src, dst);
      }
      if (n > maxPage) maxPage = n;
    }
    return maxPage || 1;
  }
  if (mime.startsWith('image/')) {
    fs.copyFileSync(filePath, path.join(outDir, 'page-1.png'));
    return 1;
  }
  return 0;
}

/* ---------- Разбиение текста на строки ---------- */
function wrapText(text, font, size, maxWidth) {
  const paragraphs = String(text).split(/\r?\n/);
  const lines = [];
  for (const p of paragraphs) {
    if (!p.trim()) { lines.push(''); continue; }
    const words = p.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/* ---------- Кликабельная ссылка на странице PDF ---------- */
function addLinkToPage(pdfDoc, page, url, x, y, w, h) {
  const linkAnnot = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    F: 4,
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) }
  });
  const ref = pdfDoc.context.register(linkAnnot);

  const annots = page.node.Annots();
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([ref]));
}

/* ---------- Сборка PDF: имя + дата + КОММЕНТАРИЙ + ссылка ---------- */
async function buildSignedPdf(doc, approvals) {
  const filePath = path.join(UPLOAD_DIR, doc.stored_name);
  const fileBuf  = fs.readFileSync(filePath);

  let pdfDoc;
  if (doc.mime === 'application/pdf') {
    pdfDoc = await PDFDocument.load(fileBuf, { ignoreEncryption: true });
  } else if (doc.mime.startsWith('image/')) {
    pdfDoc = await PDFDocument.create();
    const img = doc.mime.includes('png')
      ? await pdfDoc.embedPng(fileBuf)
      : await pdfDoc.embedJpg(fileBuf);
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  } else {
    throw new Error('Формат не поддерживается');
  }

  pdfDoc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(FONT_PATH);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const pages = pdfDoc.getPages();
  const verifyUrl = `${PUBLIC_URL}/verify/${doc.id}`;

  for (const a of approvals) {
    if (a.status !== 'signed') continue;

    const pageIdx = Math.max(0, Math.min(pages.length - 1, (a.page || 1) - 1));
    const page = pages[pageIdx];
    const { width, height } = page.getSize();

    const px = (a.pos_x || 0.5) * width;
    const py = height - (a.pos_y || 0.75) * height;

    const name    = a.approver_name || 'Подписано';
    const date    = a.signed_at ? new Date(a.signed_at).toLocaleString('ru-RU') : '';
    const comment = (a.comment || '').trim();

    /* Ширина блока — до 260pt (примерно треть A4) */
    const boxW  = Math.min(260, width - 20);
    const inner = boxW - 14;

    const nameLines    = wrapText(name, font, 9, inner);
    const commentLines = comment ? wrapText(comment, font, 8, inner) : [];

    /* Высота блока */
    const padTop = 9;
    const padBot = 9;
    const lineName = 12;
    const lineDate = 11;
    const lineComment = 11;

    let boxH = padTop + padBot;
    boxH += nameLines.length * lineName;
    if (date) boxH += lineDate;
    if (commentLines.length) boxH += 5 + commentLines.length * lineComment;

    const boxX = Math.max(5, Math.min(width - boxW - 5, px - boxW / 2));
    const boxY = Math.max(5, Math.min(height - boxH - 5, py - boxH / 2));

    /* Рамка */
    page.drawRectangle({
      x: boxX, y: boxY, width: boxW, height: boxH,
      borderColor: rgb(0.18, 0.51, 0.97),
      borderWidth: 1,
      color: rgb(0.97, 0.99, 1),
      opacity: 0.94,
      borderOpacity: 1
    });

    /* Имя (жирный имитируем цветом — тот же шрифт) */
    let cursorY = boxY + boxH - padTop - 9;
    for (const l of nameLines) {
      page.drawText(l, { x: boxX + 7, y: cursorY, size: 9, font, color: rgb(0.05, 0.05, 0.1) });
      cursorY -= lineName;
    }

    /* Дата (серым) */
    if (date) {
      page.drawText(date, { x: boxX + 7, y: cursorY, size: 7.5, font, color: rgb(0.42, 0.42, 0.42) });
      cursorY -= lineDate;
    }

    /* Комментарий (тёмным шрифтом, после разделителя) */
    if (commentLines.length) {
      cursorY -= 2;
      const sepY = cursorY + 8;
      page.drawLine({
        start: { x: boxX + 7, y: sepY },
        end:   { x: boxX + boxW - 7, y: sepY },
        thickness: 0.5,
        color: rgb(0.75, 0.8, 0.85)
      });
      cursorY -= 6;
      for (const l of commentLines) {
        page.drawText(l, { x: boxX + 7, y: cursorY, size: 8, font, color: rgb(0.12, 0.12, 0.16) });
        cursorY -= lineComment;
      }
    }

    /* Кликабельная ссылка поверх всей рамки */
    addLinkToPage(pdfDoc, page, verifyUrl, boxX, boxY, boxW, boxH);
  }

  return await pdfDoc.save();
}

/* ==================== API ==================== */

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7*24*3600*1000
  });
  res.json({ id: user.id, username: user.username, fullName: user.full_name, isAdmin: !!user.is_admin });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

app.get('/api/me', auth, (req, res) =>
  res.json({ id: req.user.id, username: req.user.username, fullName: req.user.full_name, isAdmin: !!req.user.is_admin }));

app.get('/api/users', auth, (req, res) =>
  res.json(db.prepare('SELECT id, username, full_name FROM users WHERE id != ? ORDER BY full_name').all(req.user.id)));

app.get('/api/keys/status', auth, (req, res) => {
  const k = db.prepare('SELECT created_at FROM user_keys WHERE user_id = ?').get(req.user.id);
  res.json({ hasKey: !!k, createdAt: k?.created_at || null });
});

app.post('/api/keys/generate', auth, (req, res) => {
  const { nepPassword } = req.body || {};
  if (!nepPassword || nepPassword.length < 6) return res.status(400).json({ error: 'Пароль НЭП — минимум 6 символов' });
  if (db.prepare('SELECT user_id FROM user_keys WHERE user_id = ?').get(req.user.id))
    return res.status(400).json({ error: 'Ключ уже существует' });
  const { publicKey, privateKey } = generateKeyPair();
  const enc = encryptPrivateKey(privateKey, nepPassword);
  db.prepare('INSERT INTO user_keys (user_id, public_key, encrypted_private_key, salt) VALUES (?, ?, ?, ?)')
    .run(req.user.id, publicKey, enc.payload, enc.salt);
  res.json({ ok: true });
});


app.post('/api/keys/regenerate', auth, (req, res) => {
  const { currentPassword, nepPassword } = req.body || {};
  if (!currentPassword) return res.status(400).json({ error: 'Введите текущий пароль учётной записи' });
  if (!nepPassword || nepPassword.length < 6) {
    return res.status(400).json({ error: 'Пароль НЭП — минимум 6 символов' });
  }

  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u || !verifyPassword(currentPassword, u.password_hash)) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }

  const existing = db.prepare('SELECT user_id FROM user_keys WHERE user_id = ?').get(req.user.id);
  if (!existing) {
    return res.status(400).json({ error: 'Ключ ещё не создан. Используйте «Создать НЭП».' });
  }

  const { publicKey, privateKey } = generateKeyPair();
  const enc = encryptPrivateKey(privateKey, nepPassword);

  try {
    db.transaction(() => {
      db.prepare(`UPDATE user_keys
        SET public_key = ?, encrypted_private_key = ?, salt = ?, created_at = datetime('now')
        WHERE user_id = ?`)
        .run(publicKey, enc.payload, enc.salt, req.user.id);
    })();
  } catch (e) {
    console.error('regenerate keys error:', e);
    return res.status(500).json({ error: 'Ошибка сохранения ключа' });
  }

  res.json({ ok: true, regeneratedAt: new Date().toISOString() });
});

app.post('/api/documents', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const fixedName = fixFilename(req.file.originalname);
    const title = ((req.body.title || '').trim() || fixedName).slice(0, 200);
    const mime  = req.file.mimetype || 'application/octet-stream';
    const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

    // Проверяем, что категория существует
    let validCategoryId = null;
    if (categoryId) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
      if (cat) validCategoryId = cat.id;
    }

    const info = db.prepare(`
      INSERT INTO documents (owner_id, title, original_name, stored_name, mime, size, status, category_id)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(req.user.id, title, fixedName, req.file.filename, mime, req.file.size, validCategoryId);
    const docId = info.lastInsertRowid;
    let pages = 1;
    try { pages = (await generatePreviews(docId, req.file.path, mime)) || 1; } catch (e) { console.error(e.message); }
    db.prepare('UPDATE documents SET pages = ? WHERE id = ?').run(pages, docId);
    res.json({ id: docId, pages });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка загрузки файла' }); }
});

app.post('/api/documents/:id/sign-as-sender', auth, (req, res) => {
  const { nepPassword } = req.body || {};
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  if (doc.status !== 'draft') return res.status(400).json({ error: 'Подписать можно только черновик' });
  if (doc.sender_signature) return res.status(400).json({ error: 'Вы уже подписали этот документ' });

  const key = db.prepare('SELECT * FROM user_keys WHERE user_id = ?').get(req.user.id);
  if (!key) return res.status(400).json({ error: 'Сначала создайте НЭП в личном кабинете' });

  let priv;
  try { priv = decryptPrivateKey(key.encrypted_private_key, key.salt, String(nepPassword || '')); }
  catch { return res.status(400).json({ error: 'Неверный пароль НЭП' }); }

  const buf = fs.readFileSync(path.join(UPLOAD_DIR, doc.stored_name));
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const signedAt = new Date().toISOString();
  const payload = JSON.stringify({ docId: doc.id, docHash: hash, senderId: req.user.id, signedAt, role: 'sender' });
  const signature = signData(priv, payload);

  db.prepare(`UPDATE documents SET sender_signature=?, sender_signed_at=?, sender_hash=?, updated_at=datetime('now') WHERE id=?`)
    .run(signature, signedAt, hash, doc.id);

  res.json({ ok: true, signedAt, hash });
});

app.post('/api/documents/:id/send', auth, (req, res) => {
  const { approvers, nepPassword, senderPage, senderX, senderY, senderComment } = req.body || {};
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  if (doc.status !== 'draft') return res.status(400).json({ error: 'Документ уже отправлен' });
  if (doc.sender_signature) return res.status(400).json({ error: 'Вы уже подписали этот документ' });
  if (!nepPassword) return res.status(400).json({ error: 'Введите пароль НЭП для подписи отправителя' });
  if (!Array.isArray(approvers) || !approvers.length) return res.status(400).json({ error: 'Добавьте получателей' });

  const key = db.prepare('SELECT * FROM user_keys WHERE user_id = ?').get(req.user.id);
  if (!key) return res.status(400).json({ error: 'Сначала создайте НЭП в личном кабинете' });

  let priv;
  try { priv = decryptPrivateKey(key.encrypted_private_key, key.salt, String(nepPassword)); }
  catch { return res.status(400).json({ error: 'Неверный пароль НЭП' }); }

  const buf = fs.readFileSync(path.join(UPLOAD_DIR, doc.stored_name));
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const signedAt = new Date().toISOString();
  const pageN = Math.max(1, parseInt(senderPage, 10) || 1);
  const posX = Math.min(1, Math.max(0, Number(senderX) || 0.5));
  const posY = Math.min(1, Math.max(0, Number(senderY) || 0.75));
  const cmt = senderComment ? String(senderComment).slice(0, 1000) : null;

  const payload = JSON.stringify({
    docId: doc.id, docHash: hash, senderId: req.user.id,
    signedAt, role: 'sender', page: pageN, x: posX, y: posY
  });
  const signature = signData(priv, payload);

  const ins = db.prepare('INSERT INTO approvals (document_id, approver_id, page, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)');
  try {
    db.transaction(() => {
      db.prepare(`UPDATE documents SET
        sender_signature=?, sender_signed_at=?, sender_hash=?,
        sender_page=?, sender_pos_x=?, sender_pos_y=?, sender_comment=?,
        updated_at=datetime('now')
        WHERE id=?`)
        .run(signature, signedAt, hash, pageN, posX, posY, cmt, doc.id);

      for (const a of approvers) {
        const u = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(a.userId);
        if (!u) throw new Error('Пользователь не найден');
        if (u.id === req.user.id) throw new Error('Нельзя отправить документ самому себе');
        const ap = Math.max(1, parseInt(a.page, 10) || 1);
        const ax = Math.min(1, Math.max(0, Number(a.x) || 0.5));
        const ay = Math.min(1, Math.max(0, Number(a.y) || 0.5));
        ins.run(doc.id, u.id, ap, ax, ay);
        notify(u.id, doc.id, 'approval_request', `Вам направлен на подписание документ «${doc.title}»`);
      }

      db.prepare(`UPDATE documents SET status='pending', updated_at=datetime('now') WHERE id=?`).run(doc.id);
    })();
  } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json({ ok: true, signedAt, hash, page: pageN, x: posX, y: posY });
});


app.get('/api/documents', auth, (req, res) => {
  const box = req.query.box || 'outbox';

  if (box === 'approved') {
    const rows = db.prepare(`
      SELECT d.*, u.full_name AS owner_name,
        (SELECT COUNT(*) FROM approvals WHERE document_id = d.id) AS ac,
        (SELECT COUNT(*) FROM approvals WHERE document_id = d.id AND status='signed') AS sc
      FROM documents d
      JOIN users u ON u.id = d.owner_id
      WHERE d.status = 'approved'
      ORDER BY d.updated_at DESC
    `).all();
    return res.json(rows.map(r => ({
      id: r.id, title: r.title, status: r.status, pages: r.pages, size: r.size,
      originalName: r.original_name,
      categoryId: r.category_id, createdAt: r.created_at, ownerName: r.owner_name,
      isOwner: r.owner_id === req.user.id,
      approvalsCount: r.ac, signedCount: r.sc,
      senderSigned: !!r.sender_signature,
      senderSignedAt: r.sender_signed_at
    })));
  }

  if (box === 'rejected') {
    const rows = db.prepare(`
      SELECT d.*, u.full_name AS owner_name,
        (SELECT cancel_reason FROM approvals
           WHERE document_id = d.id AND status='cancelled' AND cancel_reason IS NOT NULL
           ORDER BY id LIMIT 1) AS reject_reason,
        (SELECT u2.full_name FROM approvals a2
           JOIN users u2 ON u2.id = a2.approver_id
           WHERE a2.document_id = d.id AND a2.status='cancelled'
           ORDER BY a2.id LIMIT 1) AS reject_author
      FROM documents d
      JOIN users u ON u.id = d.owner_id
      WHERE d.status = 'rejected'
      ORDER BY d.updated_at DESC
    `).all();
    return res.json(rows.map(r => ({
      id: r.id, title: r.title, status: r.status, pages: r.pages, size: r.size,
      originalName: r.original_name, categoryId: r.category_id, createdAt: r.created_at, ownerName: r.owner_name,
      isOwner: r.owner_id === req.user.id,
      rejectReason: r.reject_reason, rejectAuthor: r.reject_author
    })));
  }

  if (box === 'shared') {
    const rows = db.prepare(`
      SELECT d.*, u.full_name AS owner_name
      FROM document_access da
      JOIN documents d ON d.id = da.document_id
      JOIN users u ON u.id = d.owner_id
      WHERE da.user_id = ?
      ORDER BY da.granted_at DESC
    `).all(req.user.id);
    return res.json(rows.map(r => ({
      id: r.id, title: r.title, status: r.status, pages: r.pages, size: r.size,
      originalName: r.original_name, categoryId: r.category_id,
      createdAt: r.created_at, ownerName: r.owner_name,
      isOwner: false, shared: true
    })));
  }

  if (box === 'shared') {
    const rows = db.prepare(`
      SELECT d.*, u.full_name AS owner_name
      FROM document_access da
      JOIN documents d ON d.id = da.document_id
      JOIN users u ON u.id = d.owner_id
      WHERE da.user_id = ?
      ORDER BY da.granted_at DESC
    `).all(req.user.id);
    return res.json(rows.map(r => ({
      id: r.id, title: r.title, status: r.status, pages: r.pages, size: r.size,
      originalName: r.original_name, categoryId: r.category_id,
      createdAt: r.created_at, ownerName: r.owner_name,
      isOwner: false, shared: true
    })));
  }

  if (box === 'outbox') {
    const rows = db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM approvals WHERE document_id = d.id) AS ac,
        (SELECT COUNT(*) FROM approvals WHERE document_id = d.id AND status='signed') AS sc
      FROM documents d WHERE d.owner_id = ? ORDER BY d.created_at DESC
    `).all(req.user.id);
    return res.json(rows.map(r => ({
      id: r.id, title: r.title, status: r.status, pages: r.pages, size: r.size,
      originalName: r.original_name, categoryId: r.category_id, createdAt: r.created_at,
      approvalsCount: r.ac, signedCount: r.sc,
      senderSigned: !!r.sender_signature,
      senderSignedAt: r.sender_signed_at
    })));
  }

  const rows = db.prepare(`
    SELECT d.*, a.id AS aid, a.status AS astatus, u.full_name AS owner_name
    FROM approvals a
    JOIN documents d ON d.id = a.document_id
    JOIN users u ON u.id = d.owner_id
    WHERE a.approver_id = ?
      AND a.status = 'pending'
      AND d.status NOT IN ('rejected', 'approved')
    ORDER BY d.created_at DESC
  `).all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id, title: r.title, status: r.status, pages: r.pages, size: r.size,
    originalName: r.original_name, categoryId: r.category_id, createdAt: r.created_at, ownerName: r.owner_name,
    approvalId: r.aid, approvalStatus: r.astatus
  })));
});

app.get('/api/documents/:id', auth, (req, res) => {
  const d = db.prepare(`SELECT d.*, u.full_name AS owner_name FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Документ не найден' });

  const approvals = db.prepare(`
    SELECT a.*, u.full_name AS approver_name FROM approvals a
    JOIN users u ON u.id = a.approver_id WHERE a.document_id = ? ORDER BY a.id
  `).all(d.id);

  const my = approvals.find(a => a.approver_id === req.user.id);
  const isOwner = d.owner_id === req.user.id;
  const isAdmin = !!req.user.is_admin;
  if (!isOwner && !my && !isAdmin) return res.status(403).json({ error: 'Нет доступа' });

  const myKey = db.prepare('SELECT user_id FROM user_keys WHERE user_id = ?').get(req.user.id);

  res.json({
    id: d.id, title: d.title, status: d.status, pages: d.pages, size: d.size,
    originalName: d.original_name, mime: d.mime, createdAt: d.created_at,
    ownerId: d.owner_id, ownerName: d.owner_name, isOwner, hasKey: !!myKey,
    senderSigned: !!d.sender_signature,
    senderSignedAt: d.sender_signed_at,
    senderPage: d.sender_page,
    senderPosX: d.sender_pos_x,
    senderPosY: d.sender_pos_y,
    senderComment: d.sender_comment,
    myApproval: my ? {
      id: my.id, status: my.status, comment: my.comment, cancelReason: my.cancel_reason,
      page: my.page, x: my.pos_x, y: my.pos_y, signedAt: my.signed_at
    } : null,
    approvals: approvals.map(a => ({
      id: a.id, approverId: a.approver_id, approverName: a.approver_name,
      status: a.status, comment: a.comment, cancelReason: a.cancel_reason,
      page: a.page, x: a.pos_x, y: a.pos_y, signedAt: a.signed_at
    }))
  });
});

app.delete('/api/documents/:id', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });

  const isOwner = doc.owner_id === req.user.id;
  const isAdmin = !!req.user.is_admin;

  /* Владелец — только свои черновики. Админ — любой документ. */
  if (!isAdmin) {
    if (!isOwner) return res.status(403).json({ error: 'Нет доступа' });
    if (doc.status !== 'draft') {
      return res.status(400).json({ error: 'Можно удалять только черновики' });
    }
  }

  try {
    const f = path.join(UPLOAD_DIR, doc.stored_name);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    const pd = path.join(PREVIEW_DIR, String(doc.id));
    if (fs.existsSync(pd)) fs.rmSync(pd, { recursive: true, force: true });
  } catch (e) { console.error('cleanup:', e.message); }

  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  res.json({ ok: true });
});

app.get('/api/documents/:id/pages/:n', auth, (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).end();
  const allowed = d.owner_id === req.user.id || req.user.is_admin ||
    db.prepare('SELECT 1 FROM approvals WHERE document_id=? AND approver_id=?').get(d.id, req.user.id);
  if (!allowed) return res.status(403).end();
  const p = path.join(PREVIEW_DIR, String(d.id), `page-${parseInt(req.params.n, 10)}.png`);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

app.get('/api/documents/:id/watermark-info', auth, (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Документ не найден' });

  const allowed = d.owner_id === req.user.id ||
    db.prepare('SELECT 1 FROM approvals WHERE document_id=? AND approver_id=?').get(d.id, req.user.id);
  if (!allowed) return res.status(403).json({ error: 'Нет доступа' });

  const stamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  res.json({
    watermark: 'ДОКУМЕНТ ТОЛЬКО ДЛЯ ВНУТРЕННЕГО ПОЛЬЗОВАНИЯ',
    trace: req.user.full_name + ' · ' + stamp + ' МСК · ' + ip,
    isSignedDoc: d.status === 'approved' || d.status === 'pending'
  });
});

app.get('/api/documents/:id/file', auth, async (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).end();
  const allowed = d.owner_id === req.user.id || req.user.is_admin ||
    db.prepare('SELECT 1 FROM approvals WHERE document_id=? AND approver_id=?').get(d.id, req.user.id);
  if (!allowed) return res.status(403).end();

  const srcPath = path.join(UPLOAD_DIR, d.stored_name);
  if (!fs.existsSync(srcPath)) return res.status(404).end();

  const approvals = db.prepare(`
    SELECT a.*, u.full_name AS approver_name FROM approvals a
    JOIN users u ON u.id = a.approver_id WHERE a.document_id = ? ORDER BY a.id
  `).all(d.id);

  // Подписи и watermark только в программе (CSS-слой), в файл не вшиваются.
  // Отдаём оригинал без изменений.
  sendDownload(res, srcPath, d.original_name);
});

app.post('/api/documents/:id/approvals/:aid/sign', auth, (req, res) => {
  const { nepPassword, comment } = req.body || {};
  const a = db.prepare('SELECT * FROM approvals WHERE id=? AND document_id=?').get(req.params.aid, req.params.id);
  if (!a) return res.status(404).json({ error: 'Запрос не найден' });
  if (a.approver_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  if (a.status !== 'pending') return res.status(400).json({ error: 'Запрос уже обработан' });

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(a.document_id);
  if (doc.status === 'rejected') return res.status(400).json({ error: 'Документ уже отклонён' });

  const key = db.prepare('SELECT * FROM user_keys WHERE user_id = ?').get(req.user.id);
  if (!key) return res.status(400).json({ error: 'Сначала создайте НЭП в личном кабинете' });

  let priv;
  try { priv = decryptPrivateKey(key.encrypted_private_key, key.salt, String(nepPassword || '')); }
  catch { return res.status(400).json({ error: 'Неверный пароль НЭП' }); }

  const buf = fs.readFileSync(path.join(UPLOAD_DIR, doc.stored_name));
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const signedAt = new Date().toISOString();
  const commentValue = comment ? String(comment).slice(0, 1000) : '';
  const payload = JSON.stringify({ docId: doc.id, docHash: hash, approverId: req.user.id, signedAt, comment: commentValue });
  const signature = signData(priv, payload);

  db.prepare(`UPDATE approvals SET status='signed', comment=?, signature=?, signed_at=? WHERE id=?`)
    .run(commentValue || null, signature, signedAt, a.id);

  // === Продвижение очереди по уровням (group + sequential) ===
  try {
    const cur = db.prepare('SELECT * FROM approvals WHERE id=?').get(a.id);
    if (cur && cur.group_id != null && Number(cur.group_sequential) === 1) {
      const curLevel = cur.order_index || 1;

      // Проверяем, все ли на текущем уровне подписали
      const stillPending = db.prepare(`SELECT COUNT(*) AS c FROM approvals
        WHERE document_id=? AND group_id=? AND order_index=? AND status != 'signed'`)
        .get(doc.id, cur.group_id, curLevel).c;

      if (stillPending === 0) {
        // Ищем следующий уровень
        const nextRow = db.prepare(`SELECT MIN(order_index) AS next FROM approvals
          WHERE document_id=? AND group_id=? AND order_index > ? AND status='waiting'`)
          .get(doc.id, cur.group_id, curLevel);
        const nextLevel = nextRow && nextRow.next != null ? nextRow.next : null;

        if (nextLevel != null) {
          db.prepare(`UPDATE approvals SET status='pending'
            WHERE document_id=? AND group_id=? AND order_index=?`)
            .run(doc.id, cur.group_id, nextLevel);

          // Уведомляем всех на следующем уровне
          const nextUsers = db.prepare(`SELECT approver_id FROM approvals
            WHERE document_id=? AND group_id=? AND order_index=?`)
            .all(doc.id, cur.group_id, nextLevel);
          nextUsers.forEach(u => notify(u.approver_id, doc.id, 'approval_request',
            `Документ «${doc.title}» ожидает вашей подписи (этап ${nextLevel})`));
        }
      }
    }
  } catch (e) { console.error('queue promote error:', e.message); }

  const all = db.prepare('SELECT status FROM approvals WHERE document_id=?').all(doc.id);
  const allSigned = all.every(x => x.status === 'signed');
  if (allSigned) db.prepare(`UPDATE documents SET status='approved', updated_at=datetime('now') WHERE id=?`).run(doc.id);

  notify(doc.owner_id, doc.id, 'signed',
    `${req.user.full_name} подписал документ «${doc.title}»${commentValue ? ': ' + commentValue : ''}`);

  res.json({ ok: true, documentStatus: allSigned ? 'approved' : 'pending' });
});

app.post('/api/documents/:id/approvals/:aid/cancel', auth, (req, res) => {
  const { reason } = req.body || {};
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Укажите причину отмены' });

  const a = db.prepare('SELECT * FROM approvals WHERE id=? AND document_id=?').get(req.params.aid, req.params.id);
  if (!a) return res.status(404).json({ error: 'Запрос не найден' });
  if (a.approver_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  if (a.status !== 'pending') return res.status(400).json({ error: 'Запрос уже обработан' });

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(a.document_id);

  db.prepare(`UPDATE approvals SET status='cancelled', cancel_reason=? WHERE id=?`)
    .run(String(reason).trim().slice(0, 1000), a.id);
  db.prepare(`UPDATE documents SET status='rejected', updated_at=datetime('now') WHERE id=?`).run(doc.id);

  notify(doc.owner_id, doc.id, 'cancelled',
    `${req.user.full_name} отменил подпись документа «${doc.title}». Причина: ${reason}`);

  res.json({ ok: true });
});

app.get('/api/notifications', auth, (req, res) => {
  const list = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  const inbox = db.prepare(`
    SELECT COUNT(*) AS c FROM approvals a
    JOIN documents d ON d.id = a.document_id
    WHERE a.approver_id = ? AND a.status = 'pending'
      AND d.status NOT IN ('rejected', 'approved')
  `).get(req.user.id).c;
  res.json({ list, unread, inbox });
});

app.post('/api/notifications/read', auth, (req, res) => {
  const { ids } = req.body || {};
  if (Array.isArray(ids) && ids.length) {
    const stmt = db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?');
    db.transaction(() => { for (const id of ids) stmt.run(req.user.id, id); })();
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  }
  res.json({ ok: true });
});

/* ==================== ADMIN ==================== */

app.get('/api/admin/users', auth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, full_name, is_admin, created_at FROM users ORDER BY created_at').all();
  res.json(rows.map(r => ({
    id: r.id, username: r.username, fullName: r.full_name,
    is_admin: r.is_admin, created_at: r.created_at
  })));
});

app.post('/api/admin/users', auth, requireAdmin, (req, res) => {
  const { username, fullName, password, isAdmin } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });

  const uname = String(username).trim().toLowerCase().replace(/\s+/g, '');
  if (!uname) return res.status(400).json({ error: 'Некорректный логин' });

  try {
    const info = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, is_admin) VALUES (?, ?, ?, ?)'
    ).run(
      uname,
      hashPassword(password),
      String(fullName || uname).trim().slice(0, 200),
      isAdmin ? 1 : 0
    );
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'Логин уже занят' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', auth, requireAdmin, (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить самого себя' });

  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' });

  const hasApprovals = db.prepare('SELECT COUNT(*) AS c FROM approvals WHERE approver_id = ?').get(id).c;
  const hasDocs = db.prepare('SELECT COUNT(*) AS c FROM documents WHERE owner_id = ?').get(id).c;
  if (hasApprovals || hasDocs) {
    return res.status(400).json({ error: 'У пользователя есть документы или подписи — удалить нельзя' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ==================== PUBLIC: проверка без логина ==================== */

app.get('/verify/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

app.get('/api/public/verify/:id', (req, res) => {
  const id = +req.params.id;
  const d = db.prepare(`
    SELECT d.*, u.full_name AS owner_name
    FROM documents d JOIN users u ON u.id = d.owner_id
    WHERE d.id = ?
  `).get(id);
  if (!d) return res.status(404).json({ error: 'Документ не найден' });
  if (d.status !== 'approved') return res.status(404).json({ error: 'Документ не утверждён' });

  const filePath = path.join(UPLOAD_DIR, d.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });

  const fileBuf  = fs.readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuf).digest('hex');

  const rows = db.prepare(`
    SELECT a.*, u.full_name AS approver_name, k.public_key
    FROM approvals a
    JOIN users u ON u.id = a.approver_id
    LEFT JOIN user_keys k ON k.user_id = a.approver_id
    WHERE a.document_id = ? ORDER BY a.id
  `).all(d.id);

  const signatories = rows.map(a => {
    const out = {
      name: a.approver_name, status: a.status,
      signedAt: a.signed_at, comment: a.comment, cancelReason: a.cancel_reason,
      signatureValid: null, keyFingerprint: null
    };
    if (a.public_key) {
      out.keyFingerprint = crypto.createHash('sha256')
        .update(a.public_key).digest('hex').slice(0, 16).toUpperCase();
    }
    if (a.status === 'signed' && a.signature && a.public_key) {
      try {
        const payload = JSON.stringify({
          docId: d.id, docHash: fileHash,
          approverId: a.approver_id, signedAt: a.signed_at,
          comment: a.comment || ''
        });
        const v = crypto.createVerify('RSA-SHA256');
        v.update(payload); v.end();
        out.signatureValid = v.verify(a.public_key, a.signature, 'base64');
      } catch { out.signatureValid = false; }
    }
    return out;
  });

  res.json({
    id: d.id, title: d.title, ownerName: d.owner_name,
    createdAt: d.created_at, updatedAt: d.updated_at,
    status: d.status, pages: d.pages, size: d.size,
    sha256: fileHash, signatories
  });
});

app.get('/api/public/file/:id', async (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!d || d.status !== 'approved') return res.status(404).end();

  const srcPath = path.join(UPLOAD_DIR, d.stored_name);
  if (!fs.existsSync(srcPath)) return res.status(404).end();

  const approvals = db.prepare(`
    SELECT a.*, u.full_name AS approver_name FROM approvals a
    JOIN users u ON u.id = a.approver_id WHERE a.document_id = ? ORDER BY a.id
  `).all(d.id);

  // Отдаём оригинал — без подписей и watermark.
  sendDownload(res, srcPath, d.original_name);
});

/* ==================== ГРУППЫ ПОДПИСАНТОВ ==================== */

function loadGroupById(groupRow) {
  const members = db.prepare(`
    SELECT gm.level_index, gm.order_index, u.id, u.username, u.full_name
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.level_index ASC, gm.order_index ASC, gm.id ASC
  `).all(groupRow.id);

  // Группируем по уровням
  const levelsMap = new Map();
  members.forEach(m => {
    const lvl = m.level_index != null ? m.level_index : 1;
    if (!levelsMap.has(lvl)) levelsMap.set(lvl, []);
    levelsMap.get(lvl).push({
      userId: m.id,
      username: m.username,
      fullName: m.full_name,
      orderIndex: m.order_index
    });
  });

  const levels = Array.from(levelsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([levelIndex, members]) => ({ levelIndex, members }));

  return {
    id: groupRow.id,
    name: groupRow.name,
    sequential: !!groupRow.sequential,
    createdAt: groupRow.created_at,
    levels,
    // Плоский список для обратной совместимости
    members: levels.flatMap(l => l.members)
  };
}

app.get('/api/groups', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM groups WHERE owner_id = ? ORDER BY name').all(req.user.id);
  res.json(rows.map(loadGroupById));
});

app.get('/api/groups/:id', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!g) return res.status(404).json({ error: 'Группа не найдена' });
  res.json(loadGroupById(g));
});

function saveGroupLevels(groupId, levels) {
  if (!Array.isArray(levels) || !levels.length) throw new Error('Добавьте участников');
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
  const ins = db.prepare('INSERT INTO group_members (group_id, user_id, level_index, order_index) VALUES (?, ?, ?, ?)');
  levels.forEach((lvl, li) => {
    if (!Array.isArray(lvl.members) || !lvl.members.length) return;
    lvl.members.forEach((m, mi) => {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(m.userId);
      if (!u) throw new Error('Пользователь не найден');
      ins.run(groupId, m.userId, li + 1, mi + 1);
    });
  });
}

app.post('/api/groups', auth, (req, res) => {
  const { name, sequential, levels } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название группы' });
  if (!Array.isArray(levels) || !levels.length) return res.status(400).json({ error: 'Добавьте этапы' });
  try {
    let groupId;
    db.transaction(() => {
      const info = db.prepare('INSERT INTO groups (owner_id, name, sequential) VALUES (?, ?, ?)')
        .run(req.user.id, String(name).trim().slice(0, 200), sequential ? 1 : 0);
      groupId = info.lastInsertRowid;
      saveGroupLevels(groupId, levels);
    })();
    res.json({ id: groupId, ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/groups/:id', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!g) return res.status(404).json({ error: 'Группа не найдена' });
  const { name, sequential, levels } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название' });
  if (!Array.isArray(levels) || !levels.length) return res.status(400).json({ error: 'Добавьте этапы' });
  try {
    db.transaction(() => {
      db.prepare("UPDATE groups SET name = ?, sequential = ?, updated_at = datetime('now') WHERE id = ?")
        .run(String(name).trim().slice(0, 200), sequential ? 1 : 0, g.id);
      saveGroupLevels(g.id, levels);
    })();
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/groups/:id', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!g) return res.status(404).json({ error: 'Группа не найдена' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  res.json({ ok: true });
});

/* ==================== ДОБАВЛЕНИЕ НЕСКОЛЬКИХ ПОДПИСАНТОВ ==================== */

app.post('/api/documents/:id/approvals/add-signers', auth, (req, res) => {
  const { userIds, page, x, y } = req.body || {};
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.status !== 'pending') return res.status(400).json({ error: 'Документ уже не в процессе подписания' });

  const myApproval = db.prepare('SELECT * FROM approvals WHERE document_id = ? AND approver_id = ?')
    .get(doc.id, req.user.id);
  if (!myApproval) return res.status(403).json({ error: 'Вы не участник подписания этого документа' });
  if (myApproval.status === 'cancelled') return res.status(400).json({ error: 'Ваша подпись отменена' });

  if (!Array.isArray(userIds) || !userIds.length) {
    return res.status(400).json({ error: 'Выберите хотя бы одного пользователя' });
  }

  const uniqueIds = [...new Set(userIds.map(Number).filter(id => id && id !== req.user.id))];
  if (!uniqueIds.length) return res.status(400).json({ error: 'Нельзя добавить самого себя' });

  const usersToAdd = [];
  for (const uid of uniqueIds) {
    const u = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(uid);
    if (!u) return res.status(404).json({ error: `Пользователь #${uid} не найден` });
    const exists = db.prepare('SELECT 1 FROM approvals WHERE document_id = ? AND approver_id = ?')
      .get(doc.id, uid);
    if (exists) continue;
    usersToAdd.push(u);
  }

  if (!usersToAdd.length) {
    return res.status(400).json({ error: 'Все выбранные пользователи уже участвуют в подписании' });
  }

  const pageN = Math.max(1, parseInt(page, 10) || 1);
  const posX = Math.min(1, Math.max(0, Number(x) || 0.5));
  const posY = Math.min(1, Math.max(0, Number(y) || 0.5));

  const myOrder = myApproval.order_index || 0;
  const myGroup = myApproval.group_id;
  const mySeq = myApproval.group_sequential || 0;

  try {
    db.transaction(() => {
      const newOrder = myOrder + 1;

      if (myGroup != null) {
        db.prepare(`UPDATE approvals SET order_index = order_index + ?
          WHERE document_id = ? AND group_id = ? AND order_index > ?`)
          .run(usersToAdd.length, doc.id, myGroup, myOrder);
      }

      let newStatus = 'pending';
      if (myGroup != null && mySeq) {
        const laterPending = db.prepare(`SELECT COUNT(*) AS c FROM approvals
          WHERE document_id = ? AND group_id = ? AND order_index > ? AND status = 'pending'`)
          .get(doc.id, myGroup, newOrder).c;
        if (laterPending > 0) newStatus = 'waiting';
      }

      const ins = db.prepare(`INSERT INTO approvals
        (document_id, approver_id, page, pos_x, pos_y, group_id, order_index, group_sequential, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      for (const u of usersToAdd) {
        ins.run(doc.id, u.id, pageN, posX, posY, myGroup, newOrder, mySeq, newStatus);
        notify(u.id, doc.id, 'approval_request',
          newStatus === 'pending'
            ? `${req.user.full_name} добавил вас как подписанта документа «${doc.title}»`
            : `${req.user.full_name} добавил вас как подписанта документа «${doc.title}» (ожидайте очереди)`);
      }

      const names = usersToAdd.map(u => u.full_name).join(', ');
      notify(doc.owner_id, doc.id, 'signer_added',
        `${req.user.full_name} добавил подписантов: ${names} в документ «${doc.title}»`);
    })();
  } catch (e) {
    console.error('add-signers error:', e);
    return res.status(500).json({ error: e.message });
  }

  res.json({ ok: true, added: usersToAdd.length });
});

/* ==================== ПРИМЕЧАНИЯ К ДОКУМЕНТУ ==================== */

function canAccessDocument(docId, userId) {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!d) return null;
  const isOwner = d.owner_id === userId;
  const isApprover = !!db.prepare('SELECT 1 FROM approvals WHERE document_id=? AND approver_id=?')
    .get(docId, userId);
  if (!isOwner && !isApprover) return null;
  return d;
}

app.get('/api/documents/:id/annotations', auth, (req, res) => {
  const d = canAccessDocument(req.params.id, req.user.id);
  if (!d) return res.status(403).json({ error: 'Нет доступа' });

  const rows = db.prepare(`
    SELECT a.*, u.full_name AS author_name
    FROM annotations a
    JOIN users u ON u.id = a.user_id
    WHERE a.document_id = ?
    ORDER BY a.page, a.created_at
  `).all(d.id);

  res.json(rows.map(r => ({
    id: r.id,
    page: r.page,
    x: r.pos_x,
    y: r.pos_y,
    text: r.text,
    color: r.color,
    authorId: r.user_id,
    authorName: r.author_name,
    createdAt: r.created_at,
    canEdit: r.user_id === req.user.id
  })));
});

app.post('/api/documents/:id/annotations', auth, (req, res) => {
  const d = canAccessDocument(req.params.id, req.user.id);
  if (!d) return res.status(403).json({ error: 'Нет доступа' });

  const { page, x, y, text, color } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Введите текст примечания' });
  if (String(text).length > 2000) return res.status(400).json({ error: 'Слишком длинный текст (макс. 2000)' });

  const pageN = Math.max(1, parseInt(page, 10) || 1);
  const posX = Math.min(1, Math.max(0, Number(x) || 0.5));
  const posY = Math.min(1, Math.max(0, Number(y) || 0.5));
  const col = (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) ? color : '#f59e0b';

  const info = db.prepare(`INSERT INTO annotations
    (document_id, user_id, page, pos_x, pos_y, text, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(d.id, req.user.id, pageN, posX, posY, String(text).trim(), col);

  // Уведомления остальным участникам
  const participants = (() => {
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(d.id);
    const approvers = db.prepare('SELECT approver_id FROM approvals WHERE document_id = ?').all(d.id);
    const set = new Set([doc.owner_id, ...approvers.map(a => a.approver_id)]);
    return Array.from(set);
  })();
  const shortText = String(text).trim().slice(0, 80);
  const message = `${req.user.full_name} оставил примечание: «${shortText}${text.length > 80 ? '...' : ''}»`;
  participants.forEach(uid => {
    if (uid === req.user.id) return;
    try {
      db.prepare('INSERT INTO notifications (user_id, document_id, type, message) VALUES (?, ?, ?, ?)')
        .run(uid, d.id, 'annotation_added', message);
    } catch (e) { console.error('notify annot:', e.message); }
  });

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put('/api/documents/:id/annotations/:aid', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM annotations WHERE id=? AND document_id=?')
    .get(req.params.aid, req.params.id);
  if (!a) return res.status(404).json({ error: 'Примечание не найдено' });
  if (a.user_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });

  const { text, color } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Введите текст' });
  const col = (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) ? color : a.color;

  db.prepare(`UPDATE annotations SET text=?, color=?, updated_at=datetime('now') WHERE id=?`)
    .run(String(text).trim().slice(0, 2000), col, a.id);

  res.json({ ok: true });
});

app.delete('/api/documents/:id/annotations/:aid', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM annotations WHERE id=? AND document_id=?')
    .get(req.params.aid, req.params.id);
  if (!a) return res.status(404).json({ error: 'Примечание не найдено' });
  if (a.user_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });

  db.prepare('DELETE FROM annotations WHERE id=?').run(a.id);
  res.json({ ok: true });
});

/* ==================== КОММЕНТАРИИ К ПРИМЕЧАНИЯМ ==================== */

// Утилита: список всех участников документа + владелец
function getDocumentParticipants(docId) {
  const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(docId);
  if (!doc) return [];
  const approvers = db.prepare('SELECT approver_id FROM approvals WHERE document_id = ?').all(docId);
  const ids = new Set([doc.owner_id, ...approvers.map(a => a.approver_id)]);
  return Array.from(ids);
}

// Уведомление всем участникам, кроме автора действия
function notifyParticipants(docId, actorId, type, message, excludeUserIds = []) {
  const participants = getDocumentParticipants(docId);
  const exclude = new Set([actorId, ...excludeUserIds]);
  participants.forEach(uid => {
    if (exclude.has(uid)) return;
    try {
      db.prepare('INSERT INTO notifications (user_id, document_id, type, message) VALUES (?, ?, ?, ?)')
        .run(uid, docId, type, message);
    } catch (e) { console.error('notify error:', e.message); }
  });
}

// GET /api/documents/:id/annotations — уже есть, но расширим: добавим comments
app.get('/api/documents/:id/annotations-with-comments', auth, (req, res) => {
  const d = canAccessDocument(req.params.id, req.user.id);
  if (!d) return res.status(403).json({ error: 'Нет доступа' });

  const annots = db.prepare(`
    SELECT a.*, u.full_name AS author_name
    FROM annotations a
    JOIN users u ON u.id = a.user_id
    WHERE a.document_id = ?
    ORDER BY a.page, a.created_at
  `).all(d.id);

  const result = annots.map(a => {
    const comments = db.prepare(`
      SELECT c.*, u.full_name AS author_name
      FROM annotation_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.annotation_id = ?
      ORDER BY c.created_at
    `).all(a.id);

    return {
      id: a.id,
      page: a.page,
      x: a.pos_x,
      y: a.pos_y,
      text: a.text,
      color: a.color,
      authorId: a.user_id,
      authorName: a.author_name,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      canEdit: a.user_id === req.user.id,
      comments: comments.map(c => ({
        id: c.id,
        authorId: c.user_id,
        authorName: c.author_name,
        text: c.text,
        createdAt: c.created_at,
        canDelete: c.user_id === req.user.id
      }))
    };
  });

  res.json(result);
});

// POST /api/documents/:id/annotations/:aid/comments
app.post('/api/documents/:id/annotations/:aid/comments', auth, (req, res) => {
  const d = canAccessDocument(req.params.id, req.user.id);
  if (!d) return res.status(403).json({ error: 'Нет доступа' });

  const annot = db.prepare('SELECT * FROM annotations WHERE id=? AND document_id=?')
    .get(req.params.aid, d.id);
  if (!annot) return res.status(404).json({ error: 'Примечание не найдено' });

  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Введите текст комментария' });
  if (String(text).length > 2000) return res.status(400).json({ error: 'Слишком длинный (макс. 2000)' });

  const info = db.prepare(`INSERT INTO annotation_comments (annotation_id, user_id, text)
    VALUES (?, ?, ?)`)
    .run(annot.id, req.user.id, String(text).trim());

  // Уведомления: автору примечания + автору документа (если не он сам и не автор комментария)
  const message = `${req.user.full_name} прокомментировал примечание: «${String(text).trim().slice(0, 80)}${text.length > 80 ? '...' : ''}»`;

  // Автору примечания
  if (annot.user_id !== req.user.id) {
    try {
      db.prepare('INSERT INTO notifications (user_id, document_id, type, message, annotation_id) VALUES (?, ?, ?, ?, ?)')
        .run(annot.user_id, d.id, 'annotation_comment', message, annot.id);
    } catch {}
  }
  // Автору документа
  if (d.owner_id !== req.user.id && d.owner_id !== annot.user_id) {
    try {
      db.prepare('INSERT INTO notifications (user_id, document_id, type, message, annotation_id) VALUES (?, ?, ?, ?, ?)')
        .run(d.owner_id, d.id, 'annotation_comment', message, annot.id);
    } catch {}
  }

  res.json({ ok: true, id: info.lastInsertRowid });
});

// DELETE /api/documents/:id/annotations/:aid/comments/:cid
app.delete('/api/documents/:id/annotations/:aid/comments/:cid', auth, (req, res) => {
  const d = canAccessDocument(req.params.id, req.user.id);
  if (!d) return res.status(403).json({ error: 'Нет доступа' });

  const c = db.prepare(`
    SELECT c.* FROM annotation_comments c
    JOIN annotations a ON a.id = c.annotation_id
    WHERE c.id = ? AND c.annotation_id = ? AND a.document_id = ?
  `).get(req.params.cid, req.params.aid, d.id);

  if (!c) return res.status(404).json({ error: 'Комментарий не найден' });
  if (c.user_id !== req.user.id) return res.status(403).json({ error: 'Можно удалять только свои комментарии' });

  db.prepare('DELETE FROM annotation_comments WHERE id=?').run(c.id);
  res.json({ ok: true });
});

/* ==================== КАТЕГОРИИ ДОКУМЕНТОВ ==================== */

// Публичный список (для всех авторизованных — используется в модалке загрузки)
app.get('/api/categories', auth, (req, res) => {
  if (req.user.is_admin) {
    const rows = db.prepare('SELECT id, name, color FROM categories ORDER BY name').all();
    return res.json(rows.map(r => ({ id: r.id, name: r.name, color: r.color, allowed: true })));
  }
  const rows = db.prepare(`
    SELECT c.id, c.name, c.color,
      CASE WHEN uca.user_id IS NOT NULL THEN 1 ELSE 0 END AS allowed
    FROM categories c
    LEFT JOIN user_category_access uca
      ON uca.category_id = c.id AND uca.user_id = ?
    WHERE uca.user_id IS NOT NULL
       OR c.id IN (
         SELECT d.category_id FROM approvals a
         JOIN documents d ON d.id = a.document_id
         WHERE a.approver_id = ? AND d.category_id IS NOT NULL
       )
    ORDER BY c.name
  `).all(req.user.id, req.user.id);
  res.json(rows.map(r => ({ id: r.id, name: r.name, color: r.color, allowed: !!r.allowed })));
});

// Создание (только админ)
app.post('/api/admin/categories', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Только администратор' });
  const { name, color } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название' });
  const trimmed = String(name).trim().slice(0, 100);
  const col = (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) ? color : '#2f81f7';

  try {
    const info = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(trimmed, col);
    res.json({ id: info.lastInsertRowid, name: trimmed, color: col });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return res.status(400).json({ error: 'Такая категория уже существует' });
    res.status(400).json({ error: e.message });
  }
});

// Редактирование (только админ)
app.put('/api/admin/categories/:id', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Только администратор' });
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });

  const { name, color } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название' });
  const trimmed = String(name).trim().slice(0, 100);
  const col = (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) ? color : cat.color;

  try {
    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(trimmed, col, cat.id);
    res.json({ ok: true });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return res.status(400).json({ error: 'Такая категория уже существует' });
    res.status(400).json({ error: e.message });
  }
});

// Удаление (только админ)
app.delete('/api/admin/categories/:id', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Только администратор' });
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });

  // Открепляем категорию у документов
  db.prepare('UPDATE documents SET category_id = NULL WHERE category_id = ?').run(cat.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  res.json({ ok: true });
});

/* ==================== SPA fallback ==================== */

app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));


// === PATCH: обновление черновика (категория, заголовок) ===
app.patch('/api/documents/:id', auth, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
    if (doc.status !== 'draft') return res.status(400).json({ error: 'Редактировать можно только черновик' });

    const fields = [];
    const params = [];

    if (req.body.category_id !== undefined) {
      const raw = req.body.category_id;
      const cid = (raw === '' || raw === null || raw === undefined) ? null : Number(raw);
      let valid = null;
      if (cid && Number.isFinite(cid)) {
        const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(cid);
        if (cat) valid = cat.id;
      }
      fields.push('category_id = ?');
      params.push(valid);
    }

    if (req.body.title !== undefined) {
      const t = String(req.body.title || '').trim().slice(0, 200);
      if (t) { fields.push('title = ?'); params.push(t); }
    }

    if (!fields.length) return res.json({ ok: true });

    params.push(req.params.id);
    db.prepare(`UPDATE documents SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/documents/:id error:', e);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// === PATCH: обновление черновика (категория, заголовок) ===
app.patch('/api/documents/:id', auth, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });
    if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
    if (doc.status !== 'draft') return res.status(400).json({ error: 'Редактировать можно только черновик' });

    const fields = [];
    const params = [];

    if (req.body.category_id !== undefined) {
      const raw = req.body.category_id;
      const cid = (raw === '' || raw === null || raw === undefined) ? null : Number(raw);
      let valid = null;
      if (cid && Number.isFinite(cid)) {
        const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(cid);
        if (cat) valid = cat.id;
      }
      fields.push('category_id = ?');
      params.push(valid);
    }

    if (req.body.title !== undefined) {
      const t = String(req.body.title || '').trim().slice(0, 200);
      if (t) { fields.push('title = ?'); params.push(t); }
    }

    if (!fields.length) return res.json({ ok: true });

    params.push(req.params.id);
    db.prepare(`UPDATE documents SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/documents/:id error:', e);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// === ADMIN: управление категорийным доступом пользователя ===
if (typeof adminOnly !== 'function') {
  global.adminOnly = function(req, res, next) {
    if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Требуются права администратора' });
    next();
  };
  var adminOnly = global.adminOnly;
}

app.get('/api/users/:id/categories', auth, adminOnly, (req, res) => {
  const uid = Number(req.params.id);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Некорректный id' });
  const rows = db.prepare('SELECT category_id FROM user_category_access WHERE user_id = ?').all(uid);
  res.json(rows.map(r => r.category_id));
});

app.put('/api/users/:id/categories', auth, adminOnly, (req, res) => {
  const uid = Number(req.params.id);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Некорректный id' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const ids = Array.isArray(req.body && req.body.category_ids)
    ? req.body.category_ids.map(Number).filter(Number.isFinite)
    : [];

  const valid = ids.length
    ? db.prepare(`SELECT id FROM categories WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(r => r.id)
    : [];

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_category_access WHERE user_id = ?').run(uid);
    const ins = db.prepare('INSERT OR IGNORE INTO user_category_access (user_id, category_id) VALUES (?, ?)');
    for (const cid of valid) ins.run(uid, cid);
  });
  tx();
  res.json({ ok: true, category_ids: valid });
});

// === DOCUMENT: доступ к отдельным документам ===
app.get('/api/documents/:id/access', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Нет доступа' });
  const rows = db.prepare(`
    SELECT da.user_id, da.granted_at, u.username, u.full_name
    FROM document_access da JOIN users u ON u.id = da.user_id
    WHERE da.document_id = ? ORDER BY da.granted_at DESC
  `).all(req.params.id);
  res.json(rows);
});

app.post('/api/documents/:id/access', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Нет доступа' });

  const ids = Array.isArray(req.body && req.body.user_ids)
    ? req.body.user_ids.map(Number).filter(Number.isFinite)
    : [];

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM document_access WHERE document_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT OR IGNORE INTO document_access (document_id, user_id, granted_by) VALUES (?, ?, ?)');
    for (const uid of ids) ins.run(req.params.id, uid, req.user.id);
  });
  tx();
  res.json({ ok: true, user_ids: ids });
});

app.delete('/api/documents/:id/access/:userId', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Нет доступа' });
  db.prepare('DELETE FROM document_access WHERE document_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ ok: true });
});

// === ADMIN: управление категорийным доступом пользователя ===
if (typeof adminOnly !== 'function') {
  global.adminOnly = function(req, res, next) {
    if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Требуются права администратора' });
    next();
  };
  var adminOnly = global.adminOnly;
}

app.get('/api/users/:id/categories', auth, adminOnly, (req, res) => {
  const uid = Number(req.params.id);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Некорректный id' });
  const rows = db.prepare('SELECT category_id FROM user_category_access WHERE user_id = ?').all(uid);
  res.json(rows.map(r => r.category_id));
});

app.put('/api/users/:id/categories', auth, adminOnly, (req, res) => {
  const uid = Number(req.params.id);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Некорректный id' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const ids = Array.isArray(req.body && req.body.category_ids)
    ? req.body.category_ids.map(Number).filter(Number.isFinite)
    : [];

  const valid = ids.length
    ? db.prepare(`SELECT id FROM categories WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(r => r.id)
    : [];

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_category_access WHERE user_id = ?').run(uid);
    const ins = db.prepare('INSERT OR IGNORE INTO user_category_access (user_id, category_id) VALUES (?, ?)');
    for (const cid of valid) ins.run(uid, cid);
  });
  tx();
  res.json({ ok: true, category_ids: valid });
});

// === DOCUMENT: доступ к отдельным документам ===
app.get('/api/documents/:id/access', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Нет доступа' });
  const rows = db.prepare(`
    SELECT da.user_id, da.granted_at, u.username, u.full_name
    FROM document_access da JOIN users u ON u.id = da.user_id
    WHERE da.document_id = ? ORDER BY da.granted_at DESC
  `).all(req.params.id);
  res.json(rows);
});

app.post('/api/documents/:id/access', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Нет доступа' });

  const ids = Array.isArray(req.body && req.body.user_ids)
    ? req.body.user_ids.map(Number).filter(Number.isFinite)
    : [];

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM document_access WHERE document_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT OR IGNORE INTO document_access (document_id, user_id, granted_by) VALUES (?, ?, ?)');
    for (const uid of ids) ins.run(req.params.id, uid, req.user.id);
  });
  tx();
  res.json({ ok: true, user_ids: ids });
});

app.delete('/api/documents/:id/access/:userId', auth, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  if (doc.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Нет доступа' });
  db.prepare('DELETE FROM document_access WHERE document_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ ok: true });
});
app.listen(PORT, '0.0.0.0', () => {
  const c = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  console.log(`ЭДО запущен на порту ${PORT}. Пользователей: ${c}. Public URL: ${PUBLIC_URL}`);
});
