import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tag } from 'widgets/tag';

interface StringArrayEditorProps {
  items: string[];
  onAddItem: (value: string) => void;
  onEditItem: (value: string, index: number) => void;
  onRemoveItem: (index: number) => void;
  itemColor?: string;
  isHeader?: boolean;
  handleBlur?: (e: React.FocusEvent<HTMLInputElement>, callback: (val: string) => void) => void;
  handleKeyDown?: (
    e: React.KeyboardEvent<HTMLInputElement>,
    callback: (val: string) => void,
  ) => void;
}

export const StringArrayEditor = ({
  items,
  onAddItem,
  onEditItem,
  onRemoveItem,
  itemColor,
  isHeader = false,
  handleBlur,
  handleKeyDown,
}: StringArrayEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);

  const handleSubmit = useCallback(
    (value: string) => {
      if (editIndex !== undefined) {
        onEditItem(value, editIndex);
      } else {
        onAddItem(value);
        const input = inputRef.current;
        if (input) {
          input.value = '';
        }
      }
      setEditIndex(undefined);
    },
    [editIndex, onAddItem, onEditItem],
  );

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.value = editIndex !== undefined ? items[editIndex] : '';
      if (input.value) {
        input.focus();
      }
    }
  }, [editIndex, items]);

  return (
    <div role="combobox" className="input multiautocomplete multiline multiautocomplete-input">
      <div className="input-wrapper">
        {items.map((item, index) => (
          <Tag
            key={index}
            text={item}
            color={itemColor}
            isHeader={isHeader}
            onClick={() => setEditIndex(index)}
            onRemove={() => onRemoveItem(index)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          defaultValue=""
          onBlur={(e) => handleBlur?.(e, handleSubmit)}
          onKeyDown={(e) => handleKeyDown?.(e, handleSubmit)}
        />
      </div>
    </div>
  );
};
