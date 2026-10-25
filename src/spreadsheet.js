const fs = require('node:fs');
const archiver = require('archiver');

// A standalone styled Excel workbook; observed values stay literal, never formulas.
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const column = index => { let text = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text; return text; };
function chunks(value, limit = 30000, maxLines = Infinity) {
  const text = String(value ?? ''), result = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + limit, text.length), newline = offset;
    for (let count = 0; count < maxLines; count++) {
      newline = text.indexOf('\n', newline);
      if (newline < 0 || newline >= end) break;
      newline++;
      if (count + 1 === maxLines) end = newline;
    }
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    result.push(text.slice(offset, end)); offset = end;
  }
  return result.length ? result : [''];
}
function cell(value, row, index, style = 0) {
  // Inline string cells keep observed text literal, including =, + and @.
  return `<c r="${column(index)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function row(values, index, {height = 28, styles = []} = {}) {
  return `<row r="${index}" ht="${height}" customHeight="1">${values.map((value, col) => cell(value, index, col, styles[col] || 0)).join('')}</row>`;
}
function sheet(widths, rows, filterRange = null) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData>${filterRange ? `<autoFilter ref="${filterRange}"/>` : ''}<pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/><color rgb="FF243447"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF173754"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF19643B"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173754"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFDCE5ED"/></left><right style="thin"><color rgb="FFDCE5ED"/></right><top style="thin"><color rgb="FFDCE5ED"/></top><bottom style="thin"><color rgb="FFDCE5ED"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="3" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
async function writeSpreadsheet(file, product, rows) {
  const details = [row(['Product details', 'Observed content'], 1, {height: 30, styles: [1, 1]})];
  const first = rows[0] || {};
  for (const [label, value] of [['Title', product.title || ''], ['Product URL', product.sourceUrl || ''], ['Captured at', product.capturedAt || ''], ['Description', product.descriptionText || ''], ['Seller Description', product.sellerDescriptionText || ''], ['Features', first.Features || ''], ['Specifications', first.Specifications || ''],
    ['Export format', 'product-xlsx-jpeg-v10'],
    ['How to read variants', 'One Variant ID identifies one row option set within a product. Only confirmed-selected Option Status establishes that the complete combination was selected; catalog-only and unconfirmed-options rows do not establish availability. Join Variations, Image Map and image filenames by Variant ID. Design / Color, size and hoop/pack values are observed seller labels. Different designs may offer different sizes; never create a cross-product of the lists.'],
    ['How to read prices', 'Use confirmed-visible prices for the exact row only. A blank price is unconfirmed. Product-level or catalog-unverified prices are not confirmed variation prices. Currency preserves the displayed code or symbol; a bare $ does not establish USD. Prices are session observations, not guaranteed checkout totals.'],
    ['How to read images', 'matched means an image was associated with the selected options, not proof that a particular hoop or physical size is visible in the pixels. shared images are general product references copied for convenience, not proof of a selected design. reference images have no confirmed variant assignment. Do not infer size or price from image appearance or a shared photo. The Image Map records exact filenames and source URLs.'],
    ['Missing values', 'Blank design, size or hoop means that field was not exposed as a selectable option. without hoop is a seller option, not a measurement of 0 cm. Options and Options JSON preserve every original option group, including groups not classified as design, size or hoop.'],
    ['Variation capture', product.prices?.captureCoverage ? `${product.prices.captureCoverage.confirmed} of ${product.prices.captureCoverage.observed} selected combinations have confirmed prices. ${product.prices.captureCoverage.complete ? 'Observed option scan finished.' : 'INCOMPLETE: additional size/hoop choices or unconfirmed prices may remain. Run this link again.'}` : 'Not measured.'],
    ['Capture warnings', (product.warnings || []).join('\n')]]) {
    for (const [index, part] of chunks(value, 1800, 20).entries()) {
      const count = Math.max(part.split('\n').length, Math.ceil(part.length / 110));
      details.push(row([index ? `${label} (continued ${index + 1})` : label, part], details.length + 1, {height: Math.min(409, Math.max(36, count * 16 + 12)), styles: [2, 0]}));
    }
  }
  const columns = ['Variation', 'Price', 'Size', 'Color', 'Title', 'Images', 'Product ID', 'Variant ID', 'Design ID', 'Design', 'Hoop / Pack', 'Currency', 'Price Status', 'Options', 'Options JSON', 'Matched Images', 'Shared Images', 'Option Status'];
  const variations = [row(columns, 1, {height: 30, styles: columns.map(() => 1)})];
  for (const item of rows) {
    // Very long image lists are continued on explicit rows instead of being
    // silently cut at Excel's 32,767-character cell limit.
    const parts = columns.map(key => chunks(item[key] || ''));
    const count = Math.max(...parts.map(values => values.length));
    for (let index = 0; index < count; index++) variations.push(row(parts.map((values, col) => values[index] ?? (col === 0 ? '(continued)' : '')), variations.length + 1, {height: Math.min(409, Math.max(64, ...parts.map(values => Math.max((values[index] || '').split('\n').length, Math.ceil((values[index] || '').length / 45)) * 16 + 12))), styles: [2, 3, 0, 0, 0, 0]}));
  }
  const imageColumns = ['File', 'Variant ID', 'Design ID', 'Design', 'Size', 'Hoop / Pack', 'Price', 'Price Status', 'Role', 'Source URLs', 'Option Status'];
  const imageRows = [row(imageColumns, 1, {height:30, styles:imageColumns.map(() => 1)})];
  for (const item of product.imageMap || []) {
    const parts = imageColumns.map(key => chunks(item[key] || ''));
    for (let index = 0; index < Math.max(...parts.map(values => values.length)); index++) imageRows.push(row(parts.map((values, col) => values[index] ?? (col === 0 ? '(continued)' : '')), imageRows.length + 1, {height:80}));
  }
  const entries = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Product Details" sheetId="1" r:id="rId1"/><sheet name="Variations" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet([26, 112], details),
    'xl/worksheets/sheet2.xml': sheet([46, 20, 22, 22, 60, 64, 24, 22, 22, 24, 26, 16, 24, 60, 72, 64, 64, 24], variations, `A1:R${variations.length}`),
    'xl/worksheets/sheet3.xml': sheet([90, 22, 22, 24, 24, 26, 20, 24, 18, 90, 24], imageRows, `A1:K${imageRows.length}`)
  };
  entries['[Content_Types].xml'] = entries['[Content_Types].xml'].replace('</Types>', '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  entries['xl/workbook.xml'] = entries['xl/workbook.xml'].replace('</sheets>', '<sheet name="Image Map" sheetId="3" r:id="rId4"/></sheets>');
  entries['xl/_rels/workbook.xml.rels'] = entries['xl/_rels/workbook.xml.rels'].replace('</Relationships>', '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>');
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(file, {flags: 'wx'});
    const zip = archiver('zip', {zlib: {level: 6}});
    stream.on('close', resolve); stream.on('error', reject); zip.on('error', reject); zip.on('warning', reject);
    zip.pipe(stream);
    for (const [name, content] of Object.entries(entries)) zip.append(content, {name});
    zip.finalize().catch(reject);
  });
}
module.exports = {writeSpreadsheet};
