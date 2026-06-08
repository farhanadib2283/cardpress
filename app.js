// ========== State ==========
const state = {
  cards: [],        // [{file, name, url}] — sorted by filename
  currentSide: 'front',
  currentSheet: 0,
  layout: null
};

const PAGE_PRESETS = {
  'plano-692x498': [692, 498],
  'sra3-landscape': [450, 320],
  'a3-landscape': [420, 297],
  'custom': null
};

// ========== DOM ==========
const $ = id => document.getElementById(id);
const el = {
  dropZone: $('dropZone'), cardInput: $('cardInput'), clearBtn: $('clearBtn'),
  uploadCount: $('uploadCount'), thumbStrip: $('thumbStrip'),
  pagePreset: $('pagePreset'), pageWidth: $('pageWidth'), pageHeight: $('pageHeight'),
  cardWidth: $('cardWidth'), cardHeight: $('cardHeight'),
  bleed: $('bleed'), gap: $('gap'), margin: $('margin'),
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
  // Drop zone
  el.dropZone.addEventListener('click', () => el.cardInput.click());
  el.dropZone.addEventListener('dragover', e => { e.preventDefault(); el.dropZone.classList.add('dragover'); });
  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
  el.dropZone.addEventListener('drop', e => {
    e.preventDefault(); el.dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  el.cardInput.addEventListener('change', e => handleFiles(e.target.files));
  el.clearBtn.addEventListener('click', clearCards);

  // Presets
  el.pagePreset.addEventListener('change', () => {
    const p = PAGE_PRESETS[el.pagePreset.value];
    if (p) { el.pageWidth.value = p[0]; el.pageHeight.value = p[1]; }
    recalculate();
  });

  // Inputs
  [el.pageWidth, el.pageHeight, el.cardWidth, el.cardHeight, el.bleed, el.gap, el.margin]
    .forEach(inp => inp.addEventListener('input', recalculate));
  el.cutLineStyle.addEventListener('change', updatePreview);

  // Tabs & nav
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

function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) { showToast('No image files found.', 'error'); return; }

  // Revoke old URLs
  state.cards.forEach(c => URL.revokeObjectURL(c.url));

  // Create card entries
  state.cards = files.sort(naturalSort).map(f => ({
    file: f,
    name: f.name,
    url: URL.createObjectURL(f)
  }));

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
  // Show max 30 thumbnails
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
  return {
    pageW: parseFloat(el.pageWidth.value) || 692,
    pageH: parseFloat(el.pageHeight.value) || 498,
    cardW: parseFloat(el.cardWidth.value) || 59.32,
    cardH: parseFloat(el.cardHeight.value) || 94,
    bleed: parseFloat(el.bleed.value) || 0,
    gap: parseFloat(el.gap.value) || 0,
    margin: parseFloat(el.margin.value) || 10,
    cutStyle: el.cutLineStyle.value
  };
}

function calculateLayout(cfg) {
  const cellW = cfg.cardW + cfg.bleed * 2;
  const cellH = cfg.cardH + cfg.bleed * 2;
  const centerGap = 10;
  const halfW = (cfg.pageW - cfg.margin * 2 - centerGap) / 2;
  const printH = cfg.pageH - cfg.margin * 2;

  const cols = Math.max(1, Math.floor((halfW + cfg.gap) / (cellW + cfg.gap)));
  const rows = Math.max(1, Math.floor((printH + cfg.gap) / (cellH + cfg.gap)));
  const perSheet = cols * rows;
  const totalCards = state.cards.length || 500;
  const sheets = Math.ceil(totalCards / perSheet);

  const usedW = cols * cellW + (cols - 1) * cfg.gap;
  const usedH = rows * cellH + (rows - 1) * cfg.gap;
  const leftOffX = cfg.margin + (halfW - usedW) / 2;
  const rightOffX = cfg.margin + halfW + centerGap + (halfW - usedW) / 2;
  const offY = cfg.margin + (printH - usedH) / 2;

  return { cols, rows, perSheet, sheets, cellW, cellH, leftOffX, rightOffX, offY, halfW, centerGap, totalCards };
}

function recalculate() {
  const cfg = getConfig();
  const L = calculateLayout(cfg);
  state.layout = L;
  state.currentSheet = Math.min(state.currentSheet, Math.max(0, L.sheets - 1));

  el.infoGrid.textContent = `${L.cols} × ${L.rows}`;
  el.infoPerSheet.textContent = L.perSheet;
  el.infoSheets.textContent = L.sheets;
  el.infoPages.textContent = L.sheets + ' (Work & Turn)';
  el.miniCards.textContent = `${L.totalCards} cards`;
  el.miniSheets.textContent = `${L.sheets} sheets`;
  el.miniPages.textContent = `${L.sheets} pages`;

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
  const scale = 1.6;
  const canvas = el.canvas;
  const ctx = canvas.getContext('2d');
  canvas.width = cfg.pageW * scale;
  canvas.height = cfg.pageH * scale;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const isFront = state.currentSide === 'front';
  const startIdx = state.currentSheet * L.perSheet;

  // Load images for this sheet
  const images = [];
  for (let i = 0; i < L.perSheet; i++) {
    const cardIdx = startIdx + i;
    if (cardIdx < state.cards.length) {
      images.push(loadImg(state.cards[cardIdx].url));
    } else {
      images.push(null);
    }
  }
  const loadedImgs = await Promise.all(images);

  // Draw LEFT half (FRONT — mirrored columns)
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      const idx = r * L.cols + c;
      const mirrorC = L.cols - 1 - c;
      const x = (L.leftOffX + mirrorC * (L.cellW + cfg.gap)) * scale;
      const y = (L.offY + r * (L.cellH + cfg.gap)) * scale;
      const w = L.cellW * scale;
      const h = L.cellH * scale;

      ctx.fillStyle = isFront ? '#FFF8F0' : '#F0F0F0';
      ctx.fillRect(x, y, w, h);
      if (loadedImgs[idx]) ctx.drawImage(loadedImgs[idx], x, y, w, h);

      ctx.strokeStyle = '#DDD'; ctx.lineWidth = 0.5; ctx.setLineDash([]); ctx.strokeRect(x, y, w, h);

      // Label
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = `${8 * (scale / 2)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${startIdx + idx + 1}`, x + w / 2, y + h - 3);
    }
  }

  // Draw RIGHT half (BACK — normal column order)
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      const idx = r * L.cols + c;
      const x = (L.rightOffX + c * (L.cellW + cfg.gap)) * scale;
      const y = (L.offY + r * (L.cellH + cfg.gap)) * scale;
      const w = L.cellW * scale;
      const h = L.cellH * scale;

      ctx.fillStyle = isFront ? '#F0F0F0' : '#F0F8FF';
      ctx.fillRect(x, y, w, h);
      if (loadedImgs[idx]) ctx.drawImage(loadedImgs[idx], x, y, w, h);

      ctx.strokeStyle = '#DDD'; ctx.lineWidth = 0.5; ctx.setLineDash([]); ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = `${8 * (scale / 2)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${startIdx + idx + 1}`, x + w / 2, y + h - 3);
    }
  }

  // Cut lines on left half (front)
  drawCutLinesCanvas(ctx, cfg, L, scale);
  // Solid red grid on right half (back)
  drawBackGridCanvas(ctx, cfg, L, scale);

  // Center divider
  const cx = (cfg.margin + L.halfW + L.centerGap / 2) * scale;
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
  ctx.setLineDash([]);

  // Page border
  ctx.strokeStyle = '#E53E3E'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Title labels
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = `bold ${9 * (scale / 2)}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('DEPAN (MIRROR)', (cfg.margin + L.halfW / 2) * scale, 4);
  ctx.fillText('BELAKANG (NORMAL)', (cfg.margin + L.halfW + L.centerGap + L.halfW / 2) * scale, 4);
}

function drawCutLinesCanvas(ctx, cfg, L, scale) {
  if (cfg.cutStyle === 'none') return;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
  ctx.setLineDash(cfg.cutStyle === 'dashed' ? [6, 4] : []);
  const halfEnd = (cfg.margin + L.halfW + L.centerGap / 2) * scale;
  for (let c = 0; c <= L.cols; c++) {
    const x = (L.leftOffX + c * (L.cellW + cfg.gap) - cfg.gap / 2) * scale;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ctx.canvas.height); ctx.stroke();
  }
  for (let r = 0; r <= L.rows; r++) {
    const y = (L.offY + r * (L.cellH + cfg.gap) - cfg.gap / 2) * scale;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(halfEnd, y); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawBackGridCanvas(ctx, cfg, L, scale) {
  ctx.strokeStyle = '#E53E3E'; ctx.lineWidth = 1; ctx.setLineDash([]);
  const rightStart = (cfg.margin + L.halfW + L.centerGap / 2) * scale;
  for (let c = 0; c <= L.cols; c++) {
    const x = (L.rightOffX + c * (L.cellW + cfg.gap) - cfg.gap / 2) * scale;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ctx.canvas.height); ctx.stroke();
  }
  for (let r = 0; r <= L.rows; r++) {
    const y = (L.offY + r * (L.cellH + cfg.gap) - cfg.gap / 2) * scale;
    ctx.beginPath(); ctx.moveTo(rightStart, y); ctx.lineTo(ctx.canvas.width, y); ctx.stroke();
  }
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
    // Pre-load all images as base64
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
      if (s > 0) doc.addPage([cfg.pageW, cfg.pageH], orient);
      const startIdx = s * L.perSheet;

      // LEFT = FRONT (mirrored columns)
      for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < L.cols; c++) {
          const idx = startIdx + r * L.cols + c;
          if (idx >= state.cards.length) continue;
          const mirrorC = L.cols - 1 - c;
          const x = L.leftOffX + mirrorC * (L.cellW + cfg.gap);
          const y = L.offY + r * (L.cellH + cfg.gap);
          doc.addImage(allImageData[idx], 'JPEG', x, y, L.cellW, L.cellH, `card_${idx}`, 'FAST');
        }
      }

      // RIGHT = BACK (normal order, same images)
      for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < L.cols; c++) {
          const idx = startIdx + r * L.cols + c;
          if (idx >= state.cards.length) continue;
          const x = L.rightOffX + c * (L.cellW + cfg.gap);
          const y = L.offY + r * (L.cellH + cfg.gap);
          doc.addImage(allImageData[idx], 'JPEG', x, y, L.cellW, L.cellH, `card_${idx}`, 'FAST');
        }
      }

      // Cut lines (front/left half)
      drawCutLinesPDF(doc, cfg, L);
      // Solid grid (back/right half)
      drawBackGridPDF(doc, cfg, L);

      const pct = 30 + ((s + 1) / L.sheets) * 65;
      updateProgress(pct, `Sheet ${s + 1} / ${L.sheets}...`);
      await sleep(5);
    }

    updateProgress(98, 'Saving PDF...');
    await sleep(100);
    doc.save(`CardPress_${state.cards.length}cards_WorkTurn.pdf`);
    showToast(`PDF berhasil! ${L.sheets} sheets, ${state.cards.length} kartu.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, 'error');
  }

  el.generateBtn.classList.remove('generating');
  el.generateBtn.querySelector('span').textContent = 'Generate PDF';
  setTimeout(() => el.progressContainer.classList.remove('active'), 2000);
}

function drawCutLinesPDF(doc, cfg, L) {
  if (cfg.cutStyle === 'none') return;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  const halfEnd = cfg.margin + L.halfW + L.centerGap / 2;

  if (cfg.cutStyle === 'dashed') {
    for (let c = 0; c <= L.cols; c++) {
      const x = L.leftOffX + c * (L.cellW + cfg.gap) - cfg.gap / 2;
      drawDashedLine(doc, x, 0, x, cfg.pageH);
    }
    for (let r = 0; r <= L.rows; r++) {
      const y = L.offY + r * (L.cellH + cfg.gap) - cfg.gap / 2;
      drawDashedLine(doc, 0, y, halfEnd, y);
    }
  } else {
    for (let c = 0; c <= L.cols; c++) {
      const x = L.leftOffX + c * (L.cellW + cfg.gap) - cfg.gap / 2;
      doc.line(x, 0, x, cfg.pageH);
    }
    for (let r = 0; r <= L.rows; r++) {
      const y = L.offY + r * (L.cellH + cfg.gap) - cfg.gap / 2;
      doc.line(0, y, halfEnd, y);
    }
  }
}

function drawBackGridPDF(doc, cfg, L) {
  doc.setDrawColor(229, 62, 62);
  doc.setLineWidth(0.2);
  const rightStart = cfg.margin + L.halfW + L.centerGap / 2;
  for (let c = 0; c <= L.cols; c++) {
    const x = L.rightOffX + c * (L.cellW + cfg.gap) - cfg.gap / 2;
    doc.line(x, 0, x, cfg.pageH);
  }
  for (let r = 0; r <= L.rows; r++) {
    const y = L.offY + r * (L.cellH + cfg.gap) - cfg.gap / 2;
    doc.line(rightStart, y, cfg.pageW, y);
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
