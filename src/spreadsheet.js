const fs = require('node:fs');
const archiver = require('archiver');

// CSV cannot retain Excel column widths or wrapping. The companion workbook
// provides a readable view without adding another spreadsheet dependency.
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const column = index => { let text = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text; return text; };
const chunks = value => { const text = String(value ?? ''); const result = []; for (let index = 0; index < text.length; index += 30000) result.push(text.slice(index, index + 30000)); return result.length ? result : ['']; };
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
  for (const [label, value] of [['Title', product.title || ''], ['Product URL', product.sourceUrl || ''], ['Description', product.descriptionText || ''], ['Seller Description', product.sellerDescriptionText || ''], ['Features', first.Features || ''], ['Specifications', first.Specifications || '']]) {
    for (const [index, part] of chunks(value).entries()) {
      const count = Math.max(part.split('\n').length, Math.ceil(part.length / 110));
      details.push(row([index ? `${label} (continued ${index + 1})` : label, part], details.length + 1, {height: Math.min(409, Math.max(36, count * 16 + 12)), styles: [2, 0]}));
    }
  }
  const columns = ['Title', 'Variation', 'Price', 'Size', 'Color', 'Images'];
  const variations = [row(columns, 1, {height: 30, styles: columns.map(() => 1)})];
  for (const item of rows) {
    // Very long image lists are continued on explicit rows instead of being
    // silently cut at Excel's 32,767-character cell limit.
    const parts = columns.map(key => chunks(item[key] || ''));
    const count = Math.max(...parts.map(values => values.length));
    for (let index = 0; index < count; index++) variations.push(row(parts.map((values, col) => values[index] ?? (col === 1 ? '(continued)' : '')), variations.length + 1, {height: 104, styles: [0, 2, 3, 0, 0, 0]}));
  }
  const entries = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Product Details" sheetId="1" r:id="rId1"/><sheet name="Variations" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet([26, 112], details),
    'xl/worksheets/sheet2.xml': sheet([50, 34, 18, 20, 20, 64], variations, `A1:F${variations.length}`)
  };
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
