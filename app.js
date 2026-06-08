// ========== State ==========
const state = {
  cards: [],
  frameFile: null, frameUrl: null, frameDataUrl: null,
  currentSide: 'front',
  currentSheet: 0,
  layout: null
};

const PAGE_PRESETS = {
  'a3plus-310x470': [310, 470],
  'a3-landscape': [420, 297],
  'custom': null
};

// ========== DOM ==========
const $ = id => document.getElementById(id);
const el = {
  dropZone: $('dropZone'), cardInput: $('cardInput'), clearBtn: $('clearBtn'),
  uploadCount: $('uploadCount'), thumbStrip: $('thumbStrip'),
  framePreview: $('framePreview'), frameInput: $('frameInput'), frameStatus: $('frameStatus'),
  pagePreset: $('pagePreset'), pageWidth: $('pageWidth'), pageHeight: $('pageHeight'),
  boxWidth: $('boxWidth'), boxHeight: $('boxHeight'),
  cutWidth: $('cutWidth'), cutHeight: $('cutHeight'),
  bleedInfo: $('bleedInfo'),
  gap: $('gap'), margin: $('margin'),
  cutLineStyle: $('cutLineStyle'),
  canvas: $('previewCanvas'), previewEmpty: $('previewEmpty'),
  tabFront: $('tabFront'), tabBack: $('tabBack'),
  prevPage: $('prevPage'), nextPage: $('nextPage'), pageIndicator: $('pageIndicator'),
  generateBtn: $('generateBtn'),
  progressContainer: $('progressContainer'),
  progressFill: $('progressFill'), progressText: $('progressText'),
  infoGrid: $('infoGrid'), infoPerSheet: $('infoPerSheet'),
  infoSheets: $('infoSheets'), infoPages: $('infoPages'),
  miniCards: $('miniCards'), miniSheets: $('miniSheets'), miniPages: $('miniPages'),
  toastContainer: $('toastContainer')
};

// ========== Init ==========
function init() {
  el.framePreview.addEventListener('click', () => el.frameInput.click());
  el.frameInput.addEventListener('change', handleFrameUpload);

  el.dropZone.addEventListener('click', () => el.cardInput.click());
  el.dropZone.addEventListener('dragover', e => { e.preventDefault(); el.dropZone.classList.add('dragover'); });
  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
  el.dropZone.addEventListener('drop', e => {
    e.preventDefault(); el.dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  el.cardInput.addEventListener('change', e => handleFiles(e.target.files));
  el.clearBtn.addEventListener('click', clearCards);

  el.pagePreset.addEventListener('change', () => {
    const p = PAGE_PRESETS[el.pagePreset.value];
    if (p) { el.pageWidth.value = p[0]; el.pageHeight.value = p[1]; }
    recalculate();
  });

  [el.pageWidth, el.pageHeight, el.boxWidth, el.boxHeight, el.cutWidth, el.cutHeight, el.gap, el.margin]
    .forEach(inp => inp.addEventListener('input', recalculate));
  el.cutLineStyle.addEventListener('change', updatePreview);

  el.tabFront.addEventListener('click', () => { state.currentSide = 'front'; setTab('front'); updatePreview(); });
  el.tabBack.addEventListener('click', () => { state.currentSide = 'back'; setTab('back'); updatePreview(); });
  el.prevPage.addEventListener('click', () => navSheet(-1));
  el.nextPage.addEventListener('click', () => navSheet(1));

  el.generateBtn.addEventListener('click', generatePDF);
  recalculate();
}

function setTab(side) {
  el.tabFront.classList.toggle('active', side === 'front');
  el.tabBack.classList.toggle('active', side === 'back');
}

// ========== File Handling ==========
function naturalSort(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

function handleFrameUpload(e) {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (state.frameUrl) URL.revokeObjectURL(state.frameUrl);
  state.frameFile = file;
  state.frameUrl = URL.createObjectURL(file);
  el.framePreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = state.frameUrl;
  el.framePreview.appendChild(img);
  el.framePreview.classList.add('has-image');
  el.frameStatus.textContent = file.name;
  readFileAsDataURL(file).then(d => { state.frameDataUrl = d; });
  updateGenerateBtn();
  updatePreview();
  showToast('Frame berhasil diupload!', 'success');
}

function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) { showToast('No image files found.', 'error'); return; }
  state.cards.forEach(c => URL.revokeObjectURL(c.url));
  state.cards = files.sort(naturalSort).map(f => ({ file: f, name: f.name, url: URL.createObjectURL(f) }));
  el.uploadCount.textContent = state.cards.length + ' images';
  updateThumbnails();
  updateGenerateBtn();
  recalculate();
  showToast(`${state.cards.length} kartu berhasil diupload!`, 'success');
}

function clearCards() {
  state.cards.forEach(c => URL.revokeObjectURL(c.url));
  state.cards = [];
  el.cardInput.value = '';
  el.uploadCount.textContent = '0 images';
  el.thumbStrip.innerHTML = '';
  updateGenerateBtn();
  recalculate();
}

function updateThumbnails() {
  el.thumbStrip.innerHTML = '';
  const max = Math.min(state.cards.length, 30);
  for (let i = 0; i < max; i++) {
    const img = document.createElement('img');
    img.src = state.cards[i].url;
    img.title = state.cards[i].name;
    el.thumbStrip.appendChild(img);
  }
  if (state.cards.length > 30) {
    const more = document.createElement('span');
    more.textContent = `+${state.cards.length - 30}`;
    more.style.cssText = 'font-size:0.7rem;color:#8B92A8;align-self:center;padding:4px;';
    el.thumbStrip.appendChild(more);
  }
}

function updateGenerateBtn() {
  el.generateBtn.disabled = state.cards.length === 0;
}

// ========== Layout Calculation ==========
function getConfig() {
  const boxW = parseFloat(el.boxWidth.value) || 59.32;
  const boxH = parseFloat(el.boxHeight.value) || 94;
  const cutW = parseFloat(el.cutWidth.value) || 55.5;
  const cutH = parseFloat(el.cutHeight.value) || 86.5;
  const bleedX = (boxW - cutW) / 2;
  const bleedY = (boxH - cutH) / 2;
  return {
    pageW: parseFloat(el.pageWidth.value) || 310,
    pageH: parseFloat(el.pageHeight.value) || 470,
    boxW, boxH, cutW, cutH, bleedX, bleedY,
    gap: parseFloat(el.gap.value) || 0,
    margin: parseFloat(el.margin.value) || 5,
    cutStyle: el.cutLineStyle.value
  };
}

function calculateLayout(cfg) {
  const printW = cfg.pageW - cfg.margin * 2;
  const printH = cfg.pageH - cfg.margin * 2;

  const cols = Math.max(1, Math.floor((printW + cfg.gap) / (cfg.boxW + cfg.gap)));
  const rows = Math.max(1, Math.floor((printH + cfg.gap) / (cfg.boxH + cfg.gap)));
  const perSheet = cols * rows;
  const totalCards = state.cards.length || 500;
  const sheets = Math.ceil(totalCards / perSheet);

  const usedW = cols * cfg.boxW + (cols - 1) * cfg.gap;
  const usedH = rows * cfg.boxH + (rows - 1) * cfg.gap;
  const offX = cfg.margin + (printW - usedW) / 2;
  const offY = cfg.margin + (printH - usedH) / 2;

  return { cols, rows, perSheet, sheets, offX, offY, totalCards };
}

function recalculate() {
  const cfg = getConfig();
  const L = calculateLayout(cfg);
  state.layout = L;
  state.currentSheet = Math.min(state.currentSheet, Math.max(0, L.sheets - 1));

  el.bleedInfo.innerHTML = `<span>Bleed: ${cfg.bleedX.toFixed(2)}mm (kiri/kanan) × ${cfg.bleedY.toFixed(2)}mm (atas/bawah)</span>`;

  el.infoGrid.textContent = `${L.cols} × ${L.rows}`;
  el.infoPerSheet.textContent = L.perSheet;
  el.infoSheets.textContent = L.sheets;
  el.infoPages.textContent = (L.sheets * 2) + ' (depan + belakang)';
  el.miniCards.textContent = `${L.totalCards} cards`;
  el.miniSheets.textContent = `${L.sheets} sheets`;
  el.miniPages.textContent = `${L.sheets * 2} pages`;

  updatePreview();
}

// ========== Preview ==========
function navSheet(dir) {
  if (!state.layout) return;
  state.currentSheet = Math.max(0, Math.min(state.layout.sheets - 1, state.currentSheet + dir));
  updatePreview();
}

function updatePreview() {
  if (state.cards.length === 0 || !state.layout) {
    el.previewEmpty.classList.remove('hidden');
    el.canvas.classList.remove('visible');
    el.pageIndicator.textContent = 'Sheet 1 / 1';
    return;
  }
  el.previewEmpty.classList.add('hidden');
  el.canvas.classList.add('visible');
  el.pageIndicator.textContent = `Sheet ${state.currentSheet + 1} / ${state.layout.sheets}`;
  drawPreview();
}

async function drawPreview() {
  const cfg = getConfig();
  const L = state.layout;
  const scale = 2.0;
  const canvas = el.canvas;
  const ctx = canvas.getContext('2d');
  canvas.width = cfg.pageW * scale;
  canvas.height = cfg.pageH * scale;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const isFront = state.currentSide === 'front';
  const startIdx = state.currentSheet * L.perSheet;

  // Load images
  const images = [];
  for (let i = 0; i < L.perSheet; i++) {
    const ci = startIdx + i;
    if (ci < state.cards.length) images.push(loadImg(state.cards[ci].url));
    else images.push(null);
  }
  const loadedImgs = await Promise.all(images);
  const frameImg = state.frameUrl ? await loadImg(state.frameUrl) : null;

  const blX = cfg.bleedX * scale;
  const blY = cfg.bleedY * scale;

  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      const idx = r * L.cols + c;
      // BACK page: mirror columns
      const col = isFront ? c : (L.cols - 1 - c);
      const cx = (L.offX + col * (cfg.boxW + cfg.gap)) * scale;
      const cy = (L.offY + r * (cfg.boxH + cfg.gap)) * scale;
      const cw = cfg.boxW * scale;
      const ch = cfg.boxH * scale;

      ctx.fillStyle = '#F8F8F8';
      ctx.fillRect(cx, cy, cw, ch);

      // Frame (full box)
      if (frameImg) ctx.drawImage(frameImg, cx, cy, cw, ch);
      // Card (centered inside frame)
      if (loadedImgs[idx]) ctx.drawImage(loadedImgs[idx], cx + blX, cy + blY, cfg.cutW * scale, cfg.cutH * scale);

      // Label
      ctx.fillStyle = frameImg ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
      ctx.font = `bold ${8 * (scale / 2)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${startIdx + idx + 1}`, cx + cw / 2, cy + ch - 3);
    }
  }

  // Outer frame grid (solid red)
  drawGridCanvas(ctx, cfg, L, scale);

  // Cut lines on FRONT only (dashed inside each cell)
  if (isFront && cfg.cutStyle !== 'none') drawCutLinesCanvas(ctx, cfg, L, scale);

  // Page border
  ctx.strokeStyle = '#CCC'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = `bold ${9 * (scale / 2)}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(isFront ? 'POSISI DEPAN (ADA GARIS POTONG)' : 'POSISI BELAKANG (MIRROR, TANPA GARIS POTONG)', cfg.pageW * scale / 2, 4);
}

function drawGridCanvas(ctx, cfg, L, scale) {
  ctx.strokeStyle = '#E53E3E'; ctx.lineWidth = 1.2; ctx.setLineDash([]);
  for (let c = 0; c <= L.cols; c++) {
    const x = (L.offX + c * (cfg.boxW + cfg.gap) - cfg.gap / 2) * scale;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ctx.canvas.height); ctx.stroke();
  }
  for (let r = 0; r <= L.rows; r++) {
    const y = (L.offY + r * (cfg.boxH + cfg.gap) - cfg.gap / 2) * scale;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ctx.canvas.width, y); ctx.stroke();
  }
}

function drawCutLinesCanvas(ctx, cfg, L, scale) {
  if (cfg.bleedX <= 0 && cfg.bleedY <= 0) return;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.7;
  ctx.setLineDash(cfg.cutStyle === 'dashed' ? [5, 3] : []);
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      const cx = (L.offX + c * (cfg.boxW + cfg.gap) + cfg.bleedX) * scale;
      const cy = (L.offY + r * (cfg.boxH + cfg.gap) + cfg.bleedY) * scale;
      ctx.strokeRect(cx, cy, cfg.cutW * scale, cfg.cutH * scale);
    }
  }
  ctx.setLineDash([]);
}

// ========== PDF Generation ==========
async function generatePDF() {
  if (state.cards.length === 0) { showToast('Upload kartu terlebih dahulu!', 'error'); return; }

  const cfg = getConfig();
  const L = calculateLayout(cfg);

  el.generateBtn.classList.add('generating');
  el.generateBtn.querySelector('span').textContent = 'Generating...';
  el.progressContainer.classList.add('active');
  updateProgress(0, 'Loading images...');
  await sleep(100);

  try {
    const allImageData = [];
    for (let i = 0; i < state.cards.length; i++) {
      const dataUrl = await readFileAsDataURL(state.cards[i].file);
      allImageData.push(dataUrl);
      if (i % 50 === 0) {
        updateProgress((i / state.cards.length) * 30, `Loading image ${i + 1}/${state.cards.length}...`);
        await sleep(5);
      }
    }

    updateProgress(30, 'Creating PDF...');
    await sleep(50);

    const { jsPDF } = window.jspdf;
    const orient = cfg.pageW > cfg.pageH ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation: orient, unit: 'mm', format: [cfg.pageW, cfg.pageH], compress: true });

    for (let s = 0; s < L.sheets; s++) {
      const startIdx = s * L.perSheet;

      // === PAGE 1: FRONT (normal column order) ===
      if (s > 0) doc.addPage([cfg.pageW, cfg.pageH], orient);

      for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < L.cols; c++) {
          const idx = startIdx + r * L.cols + c;
          if (idx >= state.cards.length) continue;
          const x = L.offX + c * (cfg.boxW + cfg.gap);
          const y = L.offY + r * (cfg.boxH + cfg.gap);
          // Frame background
          if (state.frameDataUrl) doc.addImage(state.frameDataUrl, 'JPEG', x, y, cfg.boxW, cfg.boxH, 'frame', 'FAST');
          // Card overlay
          doc.addImage(allImageData[idx], 'JPEG', x + cfg.bleedX, y + cfg.bleedY, cfg.cutW, cfg.cutH, `card_${idx}`, 'FAST');
        }
      }
      // Front: red grid + cut lines
      drawGridPDF(doc, cfg, L);
      drawCutLinesPDF(doc, cfg, L);

      // === PAGE 2: BACK (mirrored columns) ===
      doc.addPage([cfg.pageW, cfg.pageH], orient);

      for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < L.cols; c++) {
          const idx = startIdx + r * L.cols + c;
          if (idx >= state.cards.length) continue;
          const mirrorC = L.cols - 1 - c;
          const x = L.offX + mirrorC * (cfg.boxW + cfg.gap);
          const y = L.offY + r * (cfg.boxH + cfg.gap);
          // Frame background (same)
          if (state.frameDataUrl) doc.addImage(state.frameDataUrl, 'JPEG', x, y, cfg.boxW, cfg.boxH, 'frame', 'FAST');
          // Card overlay (unique)
          doc.addImage(allImageData[idx], 'JPEG', x + cfg.bleedX, y + cfg.bleedY, cfg.cutW, cfg.cutH, `card_${idx}`, 'FAST');
        }
      }
      // Back: red grid only (no cut lines)
      drawGridPDF(doc, cfg, L);

      const pct = 30 + ((s + 1) / L.sheets) * 65;
      updateProgress(pct, `Sheet ${s + 1} / ${L.sheets}...`);
      await sleep(5);
    }

    updateProgress(98, 'Saving PDF...');
    await sleep(100);
    doc.save(`CardPress_${state.cards.length}cards.pdf`);
    showToast(`PDF berhasil! ${L.sheets} sheets, ${L.sheets * 2} pages, ${state.cards.length} kartu.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, 'error');
  }

  el.generateBtn.classList.remove('generating');
  el.generateBtn.querySelector('span').textContent = 'Generate PDF';
  setTimeout(() => el.progressContainer.classList.remove('active'), 2000);
}

function drawGridPDF(doc, cfg, L) {
  doc.setDrawColor(229, 62, 62);
  doc.setLineWidth(0.25);
  for (let c = 0; c <= L.cols; c++) {
    const x = L.offX + c * (cfg.boxW + cfg.gap) - cfg.gap / 2;
    doc.line(x, 0, x, cfg.pageH);
  }
  for (let r = 0; r <= L.rows; r++) {
    const y = L.offY + r * (cfg.boxH + cfg.gap) - cfg.gap / 2;
    doc.line(0, y, cfg.pageW, y);
  }
}

function drawCutLinesPDF(doc, cfg, L) {
  if (cfg.cutStyle === 'none' || (cfg.bleedX <= 0 && cfg.bleedY <= 0)) return;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.12);
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      const x = L.offX + c * (cfg.boxW + cfg.gap) + cfg.bleedX;
      const y = L.offY + r * (cfg.boxH + cfg.gap) + cfg.bleedY;
      if (cfg.cutStyle === 'dashed') {
        drawDashedLine(doc, x, y, x + cfg.cutW, y);
        drawDashedLine(doc, x + cfg.cutW, y, x + cfg.cutW, y + cfg.cutH);
        drawDashedLine(doc, x + cfg.cutW, y + cfg.cutH, x, y + cfg.cutH);
        drawDashedLine(doc, x, y + cfg.cutH, x, y);
      } else {
        doc.rect(x, y, cfg.cutW, cfg.cutH);
      }
    }
  }
}

function drawDashedLine(doc, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len;
  let p = 0;
  while (p < len) {
    const e = Math.min(p + 2, len);
    doc.line(x1 + ux * p, y1 + uy * p, x1 + ux * e, y1 + uy * e);
    p = e + 1.5;
  }
}

// ========== Helpers ==========
function loadImg(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function updateProgress(pct, text) {
  el.progressFill.style.width = pct + '%';
  if (text) el.progressText.textContent = text;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  el.toastContainer.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 3500);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

document.addEventListener('DOMContentLoaded', init);
