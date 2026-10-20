import s from './prototype.module.css';

// Slide minh họa, không dùng renderer thật. Mỗi đoạn chữ gắn data-edit-field —
// đúng cách GĐ2 sẽ đánh dấu preview thật để "bấm vào chữ → nhảy tới ô sửa".
function photo(hue, seed = 0) {
  const a = (hue + seed * 37) % 360, b = (a + 40) % 360;
  return {
    backgroundImage: [
      `radial-gradient(circle at ${20 + (seed * 17) % 60}% ${15 + (seed * 11) % 30}%, hsl(${a} 75% 72% / .9), transparent 45%)`,
      `radial-gradient(circle at ${70 - (seed * 13) % 40}% 75%, hsl(${b} 55% 40% / .95), transparent 55%)`,
      `linear-gradient(165deg, hsl(${a} 40% 38%), hsl(${b} 45% 16%))`,
    ].join(','),
  };
}

function Field({ field, active, as: Tag = 'span', className = '', children }) {
  return <Tag data-edit-field={field} className={`${className} ${active === field ? s.fieldActive : ''}`.trim()}>{children}</Tag>;
}

export default function FakeSlide({ template, page, index = 0, mode = 'mini', activeField = null, onPickField }) {
  const editable = mode === 'full' && typeof onPickField === 'function';
  const pick = event => {
    if (!editable) return;
    const field = event.target.closest('[data-edit-field]')?.dataset.editField;
    if (field) onPickField(field);
  };
  const ratio = template.ratio === '9:16' ? s.tall : s.square;
  const common = `${s.slide} ${ratio} ${editable ? s.editable : ''} ${s[`style_${template.style}`] || ''}`;
  const items = page.items || [];

  if (template.style === 'note') {
    return (
      <div className={common} onClick={pick} aria-hidden={mode === 'mini' || undefined}>
        <div className={s.noteBar}><span>‹ Ghi chú</span><span>⋯</span></div>
        <p className={s.noteDate}>09:41 · 16 tháng 9</p>
        <Field field="title" active={activeField} as="h4" className={s.noteTitle}>{page.type === 'cover' ? page.title : `🌷 ${page.title}`}</Field>
        {page.type === 'cover'
          ? <Field field="subtitle" active={activeField} as="p" className={s.noteLead}>{page.subtitle}</Field>
          : items.map((item, i) => <div key={i} className={s.noteRow}>
              <Field field={`items.${i}.time`} active={activeField} as="u">{item.time}</Field>
              <span> {i % 2 ? '☕' : '📍'} <Field field={`items.${i}.name`} active={activeField}>{item.name}</Field> – <Field field={`items.${i}.address`} active={activeField}>{item.address}</Field></span>
            </div>)}
        <b className={s.pageBadge}>{String(index + 1).padStart(2, '0')}</b>
      </div>
    );
  }

  if (page.type === 'cover' || template.style === 'spotlight') {
    return (
      <div className={common} style={photo(template.hue, index)} onClick={pick} aria-hidden={mode === 'mini' || undefined}>
        <span className={s.slideChip}>ĐÀ LẠT</span>
        <div className={page.type === 'cover' ? s.coverCopy : s.spotCopy}>
          {page.type === 'cover' ? <span className={s.coverScript}>Da Lat</span> : null}
          <Field field="title" active={activeField} as="h4">{page.title}</Field>
          <Field field="subtitle" active={activeField} as="p">{page.subtitle}</Field>
        </div>
        <b className={s.pageBadge}>{String(index + 1).padStart(2, '0')}</b>
      </div>
    );
  }

  if (template.style === 'grid') {
    return (
      <div className={common} onClick={pick} aria-hidden={mode === 'mini' || undefined}>
        <Field field="title" active={activeField} as="h4" className={s.gridTitle}>{page.title}</Field>
        <div className={s.gridTiles}>{items.map((item, i) => <div key={i} style={photo(template.hue, index * 4 + i)}>
          <Field field={`items.${i}.name`} active={activeField}>{item.name}</Field>
        </div>)}</div>
        <Field field="subtitle" active={activeField} as="p" className={s.gridFoot}>{page.subtitle}</Field>
        <b className={s.pageBadge}>{String(index + 1).padStart(2, '0')}</b>
      </div>
    );
  }

  return (
    <div className={common} onClick={pick} aria-hidden={mode === 'mini' || undefined}>
      <div className={s.paperHead}>
        <Field field="title" active={activeField} as="h4">{page.title}</Field>
        <Field field="subtitle" active={activeField} as="p">{page.subtitle}</Field>
      </div>
      <ol className={s.paperRows}>{items.map((item, i) => <li key={i}>
        <Field field={`items.${i}.time`} active={activeField} className={s.paperTime}>{item.time}</Field>
        <span><Field field={`items.${i}.name`} active={activeField} as="strong">{item.name}</Field><Field field={`items.${i}.address`} active={activeField} as="small">{item.address}</Field></span>
      </li>)}</ol>
      <b className={s.pageBadge}>{String(index + 1).padStart(2, '0')}</b>
    </div>
  );
}
