import type { ComponentType } from 'react';

// Aqua icons from ryOS (public/os/icons); see NOTICE for their origin.

export type IconComponent = ComponentType<{ size?: number }>;

function pngIcon(name: string): IconComponent {
  const Icon = ({ size = 64 }: { size?: number }) => (
    <img
      src={`/os/icons/${name}.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="os-icon"
    />
  );
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

export const AboutIcon = pngIcon('textedit');
export const ResumeIcon = pngIcon('preview');
export const PdfIcon = pngIcon('file-pdf');
export const FolderIcon = pngIcon('folder');
export const TerminalIcon = pngIcon('terminal');
export const BrowserIcon = pngIcon('ie');
export const ProjectIcon = pngIcon('app');
export const TrashIcon = pngIcon('trash-empty');
export const DiskIcon = pngIcon('disk');
