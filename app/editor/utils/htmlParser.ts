import { BlockData, TableCellData } from '../types';
import { generateId } from './index';

// Marker used to detect our own clipboard data inside HTML
export const CLIPBOARD_MARKER = 'data-nc-blocks';

const SKIP_TAGS = new Set(['style', 'script', 'meta', 'link', 'head', 'colgroup']);
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'li', 'blockquote', 'pre', 'div', 'ul', 'ol', 'table', 'hr']);
const INLINE_FORMAT_TAGS = new Set(['b', 'strong', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'mark', 'sub', 'sup']);

/** Extract text from a node, converting <br> to \n */
export function getInnerText(node: Node): string {
  let text = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toLowerCase();
      if (tag === 'br') text += '\n';
      else if (!SKIP_TAGS.has(tag)) text += getInnerText(child);
    }
  });
  return text;
}

/** Extract formatted HTML from a node, preserving inline formatting tags */
export function getInnerHtml(node: Node): string {
  let html = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      html += (child.textContent || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') { html += '<br>'; return; }
      if (SKIP_TAGS.has(tag)) return;

      const innerContent = getInnerHtml(child);

      if (INLINE_FORMAT_TAGS.has(tag)) {
        const style = el.style;
        const fw = style.fontWeight;
        const tagIsBold = tag === 'b' || tag === 'strong';
        const styleNegatesBold = tagIsBold && fw && (fw === 'normal' || fw === '400' || parseInt(fw) < 600);

        if (styleNegatesBold) {
          html += innerContent;
        } else {
          const normalized = tag === 'strong' ? 'b'
            : tag === 'em' ? 'i'
            : (tag === 'strike' || tag === 'del') ? 's'
            : tag;
          html += `<${normalized}>${innerContent}</${normalized}>`;
        }
      } else if (tag === 'span') {
        const style = el.style;
        let wrapped = innerContent;
        const fw = style.fontWeight;
        if (fw === 'bold' || fw === '600' || fw === '700' || fw === '800' || fw === '900' ||
            (fw && parseInt(fw) >= 600)) {
          wrapped = `<b>${wrapped}</b>`;
        }
        if (style.fontStyle === 'italic') wrapped = `<i>${wrapped}</i>`;
        const td = style.textDecoration || style.textDecorationLine || '';
        if (td.includes('underline')) wrapped = `<u>${wrapped}</u>`;
        if (td.includes('line-through')) wrapped = `<s>${wrapped}</s>`;
        html += wrapped;
      } else if (tag === 'a') {
        html += innerContent;
      } else {
        html += innerContent;
      }
    }
  });
  return html;
}

/** Parse clipboard HTML into blocks */
export function parseHtmlToBlocks(html: string): BlockData[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: BlockData[] = [];

  const processListItems = (listEl: Element, type: 'bullet_list' | 'numbered_list', indent: number) => {
    listEl.childNodes.forEach(child => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const childEl = child as Element;
      const tag = childEl.tagName.toLowerCase();
      if (tag === 'li') {
        let htmlContent = '';
        let nestedList: Element | null = null;
        childEl.childNodes.forEach(liChild => {
          if (liChild.nodeType === Node.ELEMENT_NODE) {
            const liChildTag = (liChild as Element).tagName.toLowerCase();
            if (liChildTag === 'ul' || liChildTag === 'ol') {
              nestedList = liChild as Element;
            } else {
              htmlContent += getInnerHtml(liChild);
            }
          } else if (liChild.nodeType === Node.TEXT_NODE) {
            htmlContent += (liChild.textContent || '')
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }
        });
        blocks.push({ id: generateId(), type, content: htmlContent, indent });
        if (nestedList) {
          const nestedTag = (nestedList as Element).tagName.toLowerCase();
          processListItems(nestedList, nestedTag === 'ol' ? 'numbered_list' : 'bullet_list', indent + 1);
        }
      }
    });
  };

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ id: generateId(), type: 'text', content: text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (SKIP_TAGS.has(tag)) return;

    if (tag === 'h1') blocks.push({ id: generateId(), type: 'h1', content: getInnerHtml(el) });
    else if (tag === 'h2') blocks.push({ id: generateId(), type: 'h2', content: getInnerHtml(el) });
    else if (tag === 'h3') blocks.push({ id: generateId(), type: 'h3', content: getInnerHtml(el) });
    else if (tag === 'hr') blocks.push({ id: generateId(), type: 'divider', content: '' });
    else if (tag === 'blockquote') blocks.push({ id: generateId(), type: 'text', content: getInnerHtml(el) });
    else if (tag === 'p') blocks.push({ id: generateId(), type: 'text', content: getInnerHtml(el) });
    else if (tag === 'ul') processListItems(el, 'bullet_list', 0);
    else if (tag === 'ol') processListItems(el, 'numbered_list', 0);
    else if (tag === 'li') blocks.push({ id: generateId(), type: 'bullet_list', content: getInnerHtml(el), indent: 0 });
    else if (tag === 'table') {
      const tableRows: TableCellData[][] = [];
      el.querySelectorAll('tr').forEach(tr => {
        const cells: TableCellData[] = [];
        tr.querySelectorAll('td, th').forEach(cell => cells.push({ content: getInnerText(cell) }));
        if (cells.length > 0) tableRows.push(cells);
      });
      if (tableRows.length > 0) {
        const colCount = Math.max(...tableRows.map(r => r.length));
        const normalizedRows = tableRows.map(row => {
          while (row.length < colCount) row.push({ content: '' });
          return row;
        });
        blocks.push({
          id: generateId(), type: 'table', content: '',
          tableData: {
            rows: normalizedRows,
            columnWidths: Array(colCount).fill(100 / colCount),
            hasHeaderRow: el.querySelector('th') !== null,
          },
        });
      }
    } else if (tag === 'div' || tag === 'article' || tag === 'section' || tag === 'main') {
      const hasBlockChildren = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if (hasBlockChildren) el.childNodes.forEach(child => processNode(child));
      else blocks.push({ id: generateId(), type: 'text', content: getInnerHtml(el) });
    } else {
      const content = getInnerHtml(el);
      const text = content.replace(/<[^>]*>/g, '').trim();
      if (text) blocks.push({ id: generateId(), type: 'text', content });
    }
  };

  const hasBlockChildren = Array.from(doc.body.children).some(c => BLOCK_TAGS.has(c.tagName.toLowerCase()));
  if (hasBlockChildren) {
    doc.body.childNodes.forEach(child => processNode(child));
  } else {
    const content = getInnerHtml(doc.body);
    const text = content.replace(/<[^>]*>/g, '').trim();
    if (text) blocks.push({ id: generateId(), type: 'text', content });
  }

  return blocks.length > 0 ? blocks : null;
}

/** Convert blocks to HTML for external paste */
export function blocksToHtml(blockList: BlockData[]): string {
  const parts: string[] = [];
  let i = 0;

  while (i < blockList.length) {
    const b = blockList[i];
    const content = b.content || '';

    if (b.type === 'h1') parts.push(`<h1>${content}</h1>`);
    else if (b.type === 'h2') parts.push(`<h2>${content}</h2>`);
    else if (b.type === 'h3') parts.push(`<h3>${content}</h3>`);
    else if (b.type === 'divider') parts.push('<hr>');
    else if (b.type === 'bullet_list') {
      parts.push('<ul>');
      while (i < blockList.length && blockList[i].type === 'bullet_list') {
        parts.push(`<li>${blockList[i].content || ''}</li>`); i++;
      }
      parts.push('</ul>'); continue;
    } else if (b.type === 'numbered_list') {
      parts.push('<ol>');
      while (i < blockList.length && blockList[i].type === 'numbered_list') {
        parts.push(`<li>${blockList[i].content || ''}</li>`); i++;
      }
      parts.push('</ol>'); continue;
    } else if (b.type === 'table' && b.tableData) {
      parts.push('<table>');
      b.tableData.rows.forEach((row, rowIdx) => {
        parts.push('<tr>');
        const cellTag = b.tableData!.hasHeaderRow && rowIdx === 0 ? 'th' : 'td';
        row.forEach(cell => parts.push(`<${cellTag}>${cell.content || ''}</${cellTag}>`));
        parts.push('</tr>');
      });
      parts.push('</table>');
    } else {
      parts.push(`<p>${content}</p>`);
    }
    i++;
  }

  return parts.join('');
}

/** Strip HTML tags to get plain text */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}

function getBulletPrefix(indent: number): string {
  const chars = ['•', '◦', '▪'];
  return chars[Math.min(indent, chars.length - 1)];
}

/** Convert blocks to plain text */
export function blocksToText(blockList: BlockData[]): string {
  return blockList.map(b => {
    const text = stripHtml(b.content);
    if (b.type === 'bullet_list') {
      const indent = '  '.repeat(b.indent ?? 0);
      return `${indent}${getBulletPrefix(b.indent ?? 0)} ${text}`;
    }
    if (b.type === 'numbered_list') {
      const indent = '  '.repeat(b.indent ?? 0);
      return `${indent}1. ${text}`;
    }
    if (b.type === 'table' && b.tableData) {
      return b.tableData.rows.map(row => row.map(cell => cell.content).join('\t')).join('\n');
    }
    return text;
  }).join('\n');
}

/** Parse plain text into blocks, line by line. */
export function parsePlainTextToBlocks(text: string): BlockData[] | null {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: BlockData[] = [];
  let currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentLines.length === 0) return;
    const content = currentLines.join('\n');
    const trimmed = content.trim();
    let type: BlockData['type'] = 'text';
    let finalContent = content;

    if (trimmed.startsWith('### ')) { type = 'h3'; finalContent = trimmed.slice(4); }
    else if (trimmed.startsWith('## ')) { type = 'h2'; finalContent = trimmed.slice(3); }
    else if (trimmed.startsWith('# ')) { type = 'h1'; finalContent = trimmed.slice(2); }

    blocks.push({ id: generateId(), type, content: finalContent });
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) {
      flushCurrent();
      blocks.push({ id: generateId(), type: 'divider', content: '' });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushCurrent();
      const indent = Math.floor((line.length - line.trimStart().length) / 2);
      blocks.push({
        id: generateId(), type: 'bullet_list',
        content: trimmed.replace(/^[-*]\s+/, ''),
        indent: Math.min(indent, 3),
      });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushCurrent();
      const indent = Math.floor((line.length - line.trimStart().length) / 2);
      blocks.push({
        id: generateId(), type: 'numbered_list',
        content: trimmed.replace(/^\d+\.\s+/, ''),
        indent: Math.min(indent, 3),
      });
      continue;
    }

    if (trimmed === '') {
      if (currentLines.length > 0) flushCurrent();
      else blocks.push({ id: generateId(), type: 'text', content: '' });
    } else {
      currentLines.push(line);
    }
  }

  flushCurrent();
  return blocks.length > 0 ? blocks : null;
}
