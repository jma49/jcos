import type { AppProps } from '../registry';

export default function Pdf({ win }: AppProps) {
  const src = win.props?.src ?? '';
  return (
    <div className="os-app os-browser">
      <div className="os-toolbar">
        <a className="os-button" href={src} download>
          Download
        </a>
        <a className="os-button" href={src} target="_blank" rel="noopener">
          Open in tab ↗
        </a>
      </div>
      <iframe src={src} title={win.title} />
    </div>
  );
}
