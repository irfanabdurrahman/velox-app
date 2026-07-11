import 'react';

// The prototype uses `title` on inline <svg> for hover tooltips; allow it in TS.
declare module 'react' {
  interface SVGProps<T> {
    title?: string;
  }
}
