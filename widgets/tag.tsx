import React, { useMemo } from 'react';

import { IconButton } from 'widgets/button';
import { IconSet } from './icons';

import { getColorFromBackground } from './utility/color';

interface TagProps {
  text: string;
  /** background-color in CSS */
  color?: string;
  isHeader?: boolean;
  className?: string;
  onClick?: () => void;
  onRemove?: () => void;
  tooltip?: string;
  onContextMenu?: React.MouseEventHandler<HTMLSpanElement>;
}

const Tag = (props: TagProps) => {
  const { text, color, isHeader, className, onClick, onRemove, tooltip } = props;

  const style = useMemo(
    () => (color ? { backgroundColor: color, color: getColorFromBackground(color) } : undefined),
    [color],
  );

  return (
    <span
      className={`tag ${className || ''} ${isHeader ? 'tag-header' : ''}`}
      data-tooltip={tooltip}
      onClick={onClick}
      style={style}
      onContextMenu={props.onContextMenu}
    >
      <span className="label">{text}</span>
      {onRemove ? (
        <IconButton
          icon={IconSet.CLOSE}
          text="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      ) : null}
    </span>
  );
};

export { Tag };
