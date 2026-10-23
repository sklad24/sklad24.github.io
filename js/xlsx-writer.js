/* «Склад»: сборка настоящего файла .xlsx прямо в браузере, без библиотек.
   Файл — это zip с XML-частями. Формулы пишутся вместе с рассчитанным
   значением, поэтому цифры видны сразу, а Excel пересчитывает их сам. */
const XLSX_CRC_TABLE = (()=>{
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function xlsxCrc32(bytes){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) c = XLSX_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function xlsxEsc(s){
  return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function xlsxColName(i){
  let s = '';
  i++;
  while(i > 0){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
/* Номер дня для Excel (дата без времени, по местному календарю). */
function xlsxDateSerial(ts){
  const d = new Date(ts);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

/* Стили (индексы — см. cellXfs ниже):
   1 заголовок листа · 2 шапка таблицы · 3 текст · 4 деньги · 5 штуки ·
   6 дата · 7 итог текст · 8 итог деньги · 9 итог штуки · 10 примечание */
const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts>'
  + '<fonts count="4">'
  + '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><b/><sz val="14"/><color rgb="FF1F2A44"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>'
  + '</fonts>'
  + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE3F5"/><bgColor indexed="64"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F8"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color rgb="FFB0B7C3"/></left><right style="thin"><color rgb="FFB0B7C3"/></right>'
  + '<top style="thin"><color rgb="FFB0B7C3"/></top><bottom style="thin"><color rgb="FFB0B7C3"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="11">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>'
  + '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>'
  + '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="3" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Обычный" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/* Одна ячейка → XML. cell: число, строка, null или {v, f, s}. */
function xlsxCellXml(ref, cell){
  if(cell === null || cell === undefined) return '';
  let v = cell, f = null, s = 0;
  if(typeof cell === 'object' && !(cell instanceof Date)){
    v = cell.v; f = cell.f || null; s = cell.s || 0;
  }
  const sAttr = s ? ` s="${s}"` : '';
  if(f){
    const cached = (v === null || v === undefined) ? '' : v;
    if(typeof cached === 'number') return `<c r="${ref}"${sAttr}><f>${xlsxEsc(f)}</f><v>${cached}</v></c>`;
    return `<c r="${ref}"${sAttr} t="str"><f>${xlsxEsc(f)}</f><v>${xlsxEsc(cached)}</v></c>`;
  }
  if(v === null || v === undefined || v === ''){
    return s ? `<c r="${ref}"${sAttr}/>` : '';
  }
  if(typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xlsxEsc(v)}</t></is></c>`;
}

/* sheet: {name, cols:[ширины], rows:[[cell,…],…], freeze:число строк шапки,
   merges:['A1:H1',…]}. Пустые строки — просто []. */
function xlsxSheetXml(sheet){
  const rowsXml = sheet.rows.map((cells, ri)=>{
    const r = ri + 1;
    const inner = (cells || []).map((c, ci)=> xlsxCellXml(xlsxColName(ci) + r, c)).join('');
    return inner ? `<row r="${r}">${inner}</row>` : '';
  }).join('');
  const cols = (sheet.cols || []).map((w, i)=> `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
  const freeze = sheet.freeze
    ? `<pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const merges = (sheet.merges && sheet.merges.length)
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m=> `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + (cols ? `<cols>${cols}</cols>` : '')
    + `<sheetData>${rowsXml}</sheetData>`
    + merges
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    + '</worksheet>';
}

function xlsxSafeSheetName(name, used){
  let base = String(name).replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31).trim() || 'Лист';
  let out = base, k = 2;
  while(used.indexOf(out) !== -1){ out = base.slice(0, 28) + ' ' + k++; }
  used.push(out);
  return out;
}

/* Сборка zip без сжатия (method 0): так проще и надёжно для Excel. */
function xlsxZip(files){
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach(f=>{
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = xlsxCrc32(data);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, data);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + data.length;
  });
  const cdSize = central.reduce((s, c)=> s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = parts.concat(central, [end]);
  const total = all.reduce((s, a)=> s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  all.forEach(a=>{ out.set(a, pos); pos += a.length; });
  return out;
}

/* Возвращает Uint8Array готового файла .xlsx. */
function makeXlsx(sheets){
  const used = [];
  const named = sheets.map(s=> Object.assign({}, s, {name: xlsxSafeSheetName(s.name, used)}));
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + named.map((s, i)=> `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews>'
    + '<sheets>' + named.map((s, i)=> `<sheet name="${xlsxEsc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('') + '</sheets>'
    + '</workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + named.map((s, i)=> `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')
    + `<Relationship Id="rId${named.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>';
  const files = [
    {name: '[Content_Types].xml', data: ct},
    {name: '_rels/.rels', data: rels},
    {name: 'xl/workbook.xml', data: wb},
    {name: 'xl/_rels/workbook.xml.rels', data: wbRels},
    {name: 'xl/styles.xml', data: XLSX_STYLES}
  ].concat(named.map((s, i)=> ({name: `xl/worksheets/sheet${i+1}.xml`, data: xlsxSheetXml(s)})));
  return xlsxZip(files);
}
