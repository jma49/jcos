import { useOSData } from '../core/context';
import { launch } from '../core/registry';
import type { AppProps } from '../core/registry';

export default function ProjectDetail({ win }: AppProps) {
  const { projects } = useOSData();
  const p = projects.find((x) => x.slug === win.props?.slug);
  if (!p) return <div className="os-app os-empty">Project not found.</div>;

  const meta = [p.status === 'wip' ? 'In progress' : p.when, p.stack.join(', ')].filter(Boolean).join(' · ');

  return (
    <div className="os-app">
      <div className="os-toolbar">
        {p.demo && (
          <button
            type="button"
            className="os-button os-button-primary"
            onClick={() => launch('browser', { props: { url: p.demo! }, title: p.title })}
          >
            Open demo
          </button>
        )}
        {p.repo && (
          <a className="os-button" href={p.repo} target="_blank" rel="noopener">
            Source ↗
          </a>
        )}
        <span className="os-toolbar-meta">{meta}</span>
      </div>
      <article className="os-scroll os-project">
        {p.cover && <img className="os-project-cover" src={p.cover} alt={`Preview of ${p.title}`} />}
        <h1>{p.title}</h1>
        <p className="os-project-lede">{p.description}</p>
        <div className="os-prose" dangerouslySetInnerHTML={{ __html: p.html }} />
      </article>
    </div>
  );
}
