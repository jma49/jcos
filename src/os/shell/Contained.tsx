import { Component, type ReactNode } from 'react';
import { report } from '../core/report';
import { isChunkError } from './AppBoundary';

// Parts of the desktop outside the windows (the menu bar's Now Playing,
// notifications, other visitors' pointers, the Dashboard, the screen
// saver) sit outside every app's AppBoundary. An error in one of them
// would unmount the whole desktop and leave a blank page; contained, that
// part is left out and the rest carries on.

interface Props {
  /** What it is, for the console. */
  name: string;
  children: ReactNode;
}

export class Contained extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[JM/OS] ${this.props.name} stopped`, error);
    // A download that failed is a deploy since or the connection, not a fault.
    if (!isChunkError(error)) report(error, `crash.${this.props.name}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
