import { useState } from 'react';
import { useOSData } from '../core/context';
import { Inline } from '../core/inline';

export default function About() {
  const data = useOSData();
  const [long, setLong] = useState(false);
  const paragraphs = long ? data.bio.long : data.bio.short;

  return (
    <div className="os-app os-about">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Bio length">
          <button type="button" aria-pressed={!long} onClick={() => setLong(false)}>
            Short
          </button>
          <button type="button" aria-pressed={long} onClick={() => setLong(true)}>
            Long
          </button>
        </div>
        <span className="os-toolbar-meta">{long ? 'about-me.long.txt' : 'about-me.txt'}</span>
      </div>
      <article className="os-scroll os-document">
        <h1>{data.name}</h1>
        <p className="os-document-meta">
          {data.role} · {data.location}
        </p>
        {paragraphs.map((p, i) => (
          <p key={i}>
            <Inline text={p} />
          </p>
        ))}
        <p className="os-document-sign">— JM</p>
      </article>
    </div>
  );
}
