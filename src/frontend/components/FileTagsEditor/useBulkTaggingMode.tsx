import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BULK_APPLY_OPTION, BulkApplyOption } from './specialOptions';
import { GridCell, Row, VirtualizedGridRowProps } from 'widgets/combobox/Grid';
import { IconSet } from 'widgets/icons';
import { useStore } from 'src/frontend/contexts/StoreContext';

export interface BulkTag {
  id: string;
  name: string;
  pathCharLength: number;
}

export function parseBulkInput(text: string, stringsToRemove: string[] = []): string[] {
  let rawItems: string[] = [];

  try {
    const trimmedText = text.trim();
    if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        rawItems = parsed.map((i) => (typeof i === 'string' ? i : i.name || i.tag || ''));
      } else if (parsed.tags && Array.isArray(parsed.tags)) {
        rawItems = parsed.tags;
      }
    }
  } catch (e) {
    // Was not valid JSON, process raw text
  }

  // If no items were extracted from JSON, split by common delimiters
  if (rawItems.length === 0) {
    rawItems = text.split(/[,;\n\r]+/);
  }

  const processedItems = rawItems.map((item) => {
    let cleaned = item;

    // Replace strings to remove with whitespace
    if (stringsToRemove.length > 0) {
      // Escape special regex characters to ensure safe replacement if strings contain symbols
      const escapedStrings = stringsToRemove.map((s) =>
        s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'),
      );
      const regex = new RegExp(escapedStrings.join('|'), 'g');
      cleaned = cleaned.replace(regex, ' ');
    }

    // Remove duplicate spaces and apply trim
    return cleaned.replace(/\s+/g, ' ').trim();
  });

  // Filter out empty strings and remove duplicates
  const uniqueItems = Array.from(new Set(processedItems.filter((item) => item.length > 0)));

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  });

  return uniqueItems.sort(collator.compare);
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
  resetTextBox: (force?: boolean) => void;
}

const useBulkTaggingMode = ({
  active,
  popupId,
  inputText,
  resetTextBox,
}: useBulkTaggingModeProps) => {
  const { uiStore } = useStore();
  const [selectedMatches, setSelectedMatches] = useState<Map<string, boolean>>(new Map());

  const bulkAutoRemoveStrings = useMemo(
    () => uiStore.bulkAutoRemoveStrings.slice(),
    [uiStore.bulkAutoRemoveStrings],
  );
  const autoDisableBulkTagNames = useMemo(
    () => uiStore.autoDisableBulkTagNames.slice(),
    [uiStore.autoDisableBulkTagNames],
  );

  const bulkNames = useMemo(() => {
    if (!active) {
      return [];
    }
    return parseBulkInput(inputText, bulkAutoRemoveStrings);
  }, [active, bulkAutoRemoveStrings, inputText]);

  // set initial values for all bulkNames as true
  useEffect(() => {
    if (active) {
      const newMap = new Map<string, boolean>();
      // Separate exact matches from compiled regex patterns
      const exactMatchSet = new Set<string>();
      const regexPatterns: RegExp[] = [];

      for (const item of autoDisableBulkTagNames) {
        // Check if the string looks like a regex literal (e.g., "/^tag_\d+$/i")
        if (item.startsWith('/') && item.lastIndexOf('/') > 0) {
          try {
            const lastSlashIndex = item.lastIndexOf('/');
            const pattern = item.slice(1, lastSlashIndex);
            const flags = item.slice(lastSlashIndex + 1);
            regexPatterns.push(new RegExp(pattern, flags));
          } catch (e) {
            // If the regex is malformed, treat it as a fallback exact string match
            exactMatchSet.add(item);
          }
        } else {
          exactMatchSet.add(item);
        }
      }
      // Evaluate each bulkName against both criteria
      for (const name of bulkNames) {
        // Check exact match first
        let shouldOmit = exactMatchSet.has(name);
        // If not omitted yet, test against the compiled regex list
        if (!shouldOmit && regexPatterns.length > 0) {
          shouldOmit = regexPatterns.some((regex) => regex.test(name));
        }
        // If it should be omitted, set to false (unchecked)
        newMap.set(name, !shouldOmit);
      }
      setSelectedMatches(newMap);
    }
  }, [active, bulkNames, autoDisableBulkTagNames]);

  // Compute "matches" these matches are actually the detected tag names the user can assign
  const { matches, widestItem } = useMemo((): {
    matches: (string | symbol | BulkTag)[];
    widestItem: BulkTag | undefined;
  } => {
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
  }, [active, bulkNames]);

  const toggleBulkSelection = useCallback((name: string) => {
    setSelectedMatches((prev) => {
      const next = new Map(prev);
      // Invierte el estado booleano: si no existía o era false, pasa a true, y viceversa
      next.set(name, !next.get(name));
      return next;
    });
  }, []);

  const VirtualizableTagOption = useMemo(() => {
    const virtualizableTagOption = ({
      index,
      style,
      data,
      id: sub_id,
    }: VirtualizedGridRowProps<BulkTag>) => {
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
          highlightCheck={checked}
          icon={<span>{IconSet.TAG}</span>}
          onClick={() => toggleBulkSelection(item.name)}
          className="tag-option bulk-tag-option"
          tooltip={item.name}
        >
          <GridCell />
        </Row>
      );
    };
    return virtualizableTagOption;
  }, [selectedMatches, popupId, toggleBulkSelection]);

  const selectedNames = useMemo(
    () => bulkNames.filter((name) => name && selectedMatches.get(name)),
    [bulkNames, selectedMatches],
  );

  const VirtualizableBulkApplyOption = useMemo(() => {
    const VirtualizableBulkApplyOption = ({ index, style }: VirtualizedGridRowProps<symbol>) => {
      return (
        <BulkApplyOption
          key={index}
          index={index}
          style={style}
          inputText={inputText}
          tagNames={selectedNames}
          resetTextBox={resetTextBox}
        />
      );
    };
    return VirtualizableBulkApplyOption;
  }, [inputText, resetTextBox, selectedNames]);

  return {
    matches,
    widestItem,
    VirtualizableTagOption,
    VirtualizableBulkApplyOption,
  };
};

export default useBulkTaggingMode;
