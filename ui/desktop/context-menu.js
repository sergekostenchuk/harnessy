'use strict';

function contextMenuTemplate(params = {}, meta = {}, actions = {}) {
  const flags = params.editFlags || {};
  if (params.isEditable) return [
    { label: 'Вырезать', role: 'cut', enabled: !!flags.canCut },
    { label: 'Копировать', role: 'copy', enabled: !!flags.canCopy },
    { label: 'Вставить', role: 'paste', enabled: !!flags.canPaste },
    { label: 'Выделить всё', role: 'selectAll', enabled: !!flags.canSelectAll },
  ];

  const rawSelected = typeof params.selectionText === 'string' ? params.selectionText : '';
  const normalized = value => String(value || '').replace(/\r\n?/g, '\n').trim();
  const selected = normalized(rawSelected), quote = meta && meta.quote === true && normalized(meta.text) === selected && !!selected;
  const items = [{ label: 'Копировать', role: 'copy', enabled: !!flags.canCopy && !!rawSelected }];
  if (quote) items.push({ label: 'Ответить цитатой', click: () => actions.quote && actions.quote(selected) });
  if (quote) items.push({ label: 'Передать', click: () => actions.transfer && actions.transfer(selected) });
  if (params.mediaType === 'image') {
    items.push({ label: 'Копировать картинку', enabled: flags.canCopyImage !== false, click: () => actions.copyImage && actions.copyImage() });
  }
  return items;
}

module.exports = { contextMenuTemplate };
