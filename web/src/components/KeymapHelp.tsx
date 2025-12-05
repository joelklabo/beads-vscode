import React from 'react';

interface KeymapEntry {
  keys: string;
  description: string;
}

interface KeymapHelpProps {
  id?: string;
  title?: string;
  items: KeymapEntry[];
}

const KeymapHelp: React.FC<KeymapHelpProps> = ({ id, title = 'Keyboard help', items }) => (
  <div className="keymap" id={id} role="note" aria-label={title}>
    <div className="panel-subtitle">{title}</div>
    <dl className="keymap-list">
      {items.map((item) => (
        <div key={item.keys} className="keymap-row">
          <dt className="keymap-key">{item.keys}</dt>
          <dd className="keymap-desc">{item.description}</dd>
        </div>
      ))}
    </dl>
  </div>
);

export default KeymapHelp;
