import { useState, type CSSProperties, type ReactNode, type ElementType } from 'react';

// Reproduces the prototype's `style-hover` attribute: base style merged with a
// hover style while the pointer is over the element.
type Props = {
  as?: ElementType;
  style?: CSSProperties;
  hover?: CSSProperties;
  children?: ReactNode;
  [k: string]: any;
};

export function Hover({ as: Tag = 'div', style, hover, children, ...rest }: Props) {
  const [h, setH] = useState(false);
  return (
    <Tag
      {...rest}
      onMouseEnter={(e: any) => { setH(true); rest.onMouseEnter?.(e); }}
      onMouseLeave={(e: any) => { setH(false); rest.onMouseLeave?.(e); }}
      style={{ ...style, ...(h ? hover : null) }}
    >
      {children}
    </Tag>
  );
}
