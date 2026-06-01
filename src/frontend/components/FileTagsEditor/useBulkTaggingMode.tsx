import { computed } from 'mobx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BULK_APPLY_OPTION, BulkApplyOption } from './specialOptions';
import { GridCell, Row, VirtualizedGridRowProps } from 'widgets/combobox/Grid';
import { observer } from 'mobx-react-lite';
import { IconSet } from 'widgets/icons';

export interface BulkTag {
  id: string;
  name: string;
  pathCharLength: number;
}

export function parseBulkInput(text: string): string[] {
  let rawItems: string[] = [];
  try {
    if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        rawItems = parsed.map((i) => (typeof i === 'string' ? i : i.name || i.tag || ''));
      } else if (parsed.tags && Array.isArray(parsed.tags)) {
        rawItems = parsed.tags;
      }
    }
  } catch (e) {
    // Was not valid Json, process raw text
  }
  if (rawItems.length === 0) {
    rawItems = text.split(/[,;\n\r]+/);
  }
  // Trim, and exclude residual strings
  return Array.from(new Set(rawItems.map((t) => t.trim()).filter((t) => t.length > 0)));
}

export const isBulkText = (inputText: string) => {
  if (inputText.length === 0) {
    return false;
  }
  // return true if it has common delimiters or looks like a Json
  return /[,;\n\r]/.test(inputText) || (inputText.includes('{') && inputText.includes('}'));
};

export interface useBulkTaggingModeProps {
  active: boolean;
  popupId: string;
  inputText: string;
  resetTextBox: () => void;
}

const useBulkTaggingMode = ({
  active,
  popupId,
  inputText,
  resetTextBox,
}: useBulkTaggingModeProps) => {
  const [selectedMatches, setSelectedMatches] = useState<Map<string, boolean>>(new Map());

  const bulkNames = useMemo(() => {
    if (!active) {
      return [];
    }
    return parseBulkInput(inputText);
  }, [active, inputText]);

  // set initial values for all bulkNames as true
  useEffect(() => {
    if (active) {
      const newMap = new Map<string, boolean>();
      for (const name of bulkNames) {
        newMap.set(name, true);
      }
      setSelectedMatches(newMap);
    }
  }, [active, bulkNames]);

  // Compute "matches" these matches are actually the detected tag names the user can assign
  const { matches, widestItem } = useMemo(
    () =>
      computed((): { matches: (string | symbol | BulkTag)[]; widestItem: BulkTag | undefined } => {
        if (active) {
          let widest: BulkTag | undefined = undefined;
          const bulkMatches: BulkTag[] = [];

          for (const name of bulkNames) {
            const item: BulkTag = {
              id: `bulk-${name}`,
              name: name,
              pathCharLength: name.length,
            };
            bulkMatches.push(item);
            widest = widest ? (item.pathCharLength > widest.pathCharLength ? item : widest) : item;
          }

          // Add a default option that is also the apply all option.
          return {
            matches: [BULK_APPLY_OPTION, ...bulkMatches],
            widestItem: widest,
          };
        }
        return {
          matches: [],
          widestItem: undefined,
        };
      }),
    [active, bulkNames],
  ).get();

  const toggleBulkSelection = useCallback((name: string) => {
    setSelectedMatches((prev) => {
      const next = new Map(prev);
      // Invierte el estado booleano: si no existía o era false, pasa a true, y viceversa
      next.set(name, !next.get(name));
      return next;
    });
  }, []);

  const VirtualizableTagOption = useMemo(
    () =>
      observer(({ index, style, data, id: sub_id }: VirtualizedGridRowProps<BulkTag>) => {
        const item = data[index];
        const checked = selectedMatches.get(item.name) ?? false;

        return (
          <Row
            id={`${popupId}-${item.id}-${sub_id}`}
            index={index}
            style={style}
            key={item.id}
            value={item.name}
            selected={checked}
            highlightCheck={true}
            icon={<span>{IconSet.TAG}</span>}
            onClick={() => toggleBulkSelection(item.name)}
            className="tag-option bulk-tag-option"
            tooltip={`Proposed tag: ${item.name}`}
          >
            <GridCell />
          </Row>
        );
      }),
    [selectedMatches, popupId, toggleBulkSelection],
  );

  const tagNames = useMemo(
    () =>
      matches.filter(
        (match) => typeof match === 'object' && selectedMatches.get(match.name),
      ) as string[],
    [matches, selectedMatches],
  );

  const VirtualizableCreateOption = useMemo(() => {
    const VirtualizableBulkApplyOption = ({ index, style }: VirtualizedGridRowProps<symbol>) => {
      return (
        <BulkApplyOption
          key={index}
          index={index}
          style={style}
          inputText={inputText}
          tagNames={tagNames}
          resetTextBox={resetTextBox}
        />
      );
    };
    return VirtualizableBulkApplyOption;
  }, [inputText, resetTextBox, tagNames]);

  return {
    matches,
    widestItem,
    VirtualizableTagOption,
    VirtualizableCreateOption,
  };
};

export default useBulkTaggingMode;
