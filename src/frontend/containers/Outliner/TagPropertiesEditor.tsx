import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useRef } from 'react';

import { Button, IconSet, Tag } from 'widgets';
import { Dialog } from 'widgets/popovers';
import { ClientTag } from '../../entities/Tag';
import { TagSelector } from 'src/frontend/components/TagSelector';
import { Placement } from '@floating-ui/core';
import { computed } from 'mobx';
import { InfoButton } from 'widgets/notifications';
import { ColorPickerMenu, TagVisibilityMenu } from './TagsPanel/ContextMenu';
import { Menu, MenuCheckboxItem } from 'widgets/menus';
import { useStore } from 'src/frontend/contexts/StoreContext';

const FALLBACK_PLACEMENTS: Placement[] = ['bottom'];

export const TagPropertiesEditor = observer(() => {
  const { uiStore } = useStore();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const tag = uiStore.tagToEdit;
  const isOpen = tag !== undefined;

  const handleBlur = useRef(
    (
      e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>,
      setFn: (value: any) => void,
    ) => {
      const value = e.currentTarget.value.trim();
      if (value.length > 0) {
        setFn(value);
      }
    },
  ).current;
  const handleKeyDown = useRef(
    (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
      setFn: (value: any) => void,
    ) => {
      e.stopPropagation();
      const value = e.currentTarget.value.trim();
      if (!e.shiftKey && e.key === 'Enter' && value.length > 0) {
        setFn(value);
        //e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        // cancel with escape
        e.preventDefault();
        e.currentTarget.value = e.currentTarget.defaultValue;
        e.currentTarget.blur();
      }
    },
  ).current;

  // updates the number of rows of the event currentTarget
  const textAreaAutoSize = useRef((event: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    textarea.rows = 1; // Reset rows to measure properly
    const lineHeightStr = getComputedStyle(textarea).lineHeight;
    const lineHeight = parseFloat(lineHeightStr);
    if (lineHeight && !isNaN(lineHeight)) {
      const currentRows = Math.floor(textarea.scrollHeight / lineHeight);
      textarea.rows = Math.min(currentRows, 15);
    }
  }).current;

  // initialize description textArea size
  useEffect(() => {
    if (descriptionRef.current) {
      textAreaAutoSize({
        currentTarget: descriptionRef.current,
      } as React.FormEvent<HTMLTextAreaElement>);
    }
  }, [tag, textAreaAutoSize]);

  const relatedTags = useMemo(
    () =>
      computed(() => {
        // Read again here to avoid mobx alerts when using this computed
        const tag = uiStore.tagToEdit;
        if (tag === undefined) {
          return new Set<ClientTag>();
        }
        const impliedAncestors = tag.getImpliedAncestors();
        const impliedSubTags = tag.getImpliedSubTree();
        return new Set<ClientTag>([...impliedAncestors, ...impliedSubTags]);
      }),
    [uiStore.tagToEdit],
  );

  return (
    <Dialog
      open={isOpen}
      title={
        isOpen ? (
          <>
            Edit properties of{' '}
            <Tag key={tag.id} text={tag.name} color={tag.viewColor} isHeader={tag.isHeader} />
          </>
        ) : (
          ''
        )
      }
      icon={IconSet.TAG_GROUP}
      onCancel={uiStore.closeTagPropertiesEditor}
      describedby="imply-info"
      className="tag-properties-dialog"
    >
      <div id="tag-properties-dialog-content">
        {isOpen ? (
          <>
            <fieldset>
              <legend id="tag-name-label" className="dialog-section-label">
                Tag Name
              </legend>
              <input
                ref={nameInputRef}
                className="input"
                autoFocus
                type="text"
                defaultValue={tag.name}
                onBlur={(e) => handleBlur(e, tag.rename)}
                onKeyDown={(e) => handleKeyDown(e, tag.rename)}
              />
              <br />
              <br />
              <label className="dialog-label">Description</label>
              <textarea
                ref={descriptionRef}
                className="input"
                defaultValue={tag.description}
                onInput={textAreaAutoSize}
                onKeyDown={(e) => handleKeyDown(e, tag.setDescription)}
                onBlur={(e) => handleBlur(e, tag.setDescription)}
              />
            </fieldset>

            <br />

            <fieldset>
              <legend id="tag-name-label" className="dialog-section-label">
                Appearance
              </legend>
              <Menu>
                <MenuCheckboxItem
                  checked={tag.isHeader}
                  text="Show as Header"
                  onClick={tag.toggleHeader}
                />
                <ColorPickerMenu tag={tag} />
                <TagVisibilityMenu tag={tag} />
              </Menu>
            </fieldset>

            <br />

            <fieldset>
              <div style={{ display: 'flex' }}>
                <legend id="tags-imply-label" className="dialog-section-label">
                  Implied Tags
                </legend>
                <InfoButton>
                  <p>
                    This allows you to modify the implied tags for a tag. <br /> <br />
                    Note: You cannot imply a parent, child, inherited implied, or implied-by tag in
                    order to avoid circular relationships and maintain a clearer structure.
                  </p>
                </InfoButton>
              </div>
              <label className="dialog-label" htmlFor="tag-imply-picker">
                Tags implied by this tag
              </label>
              <br />
              <TagSelector
                fallbackPlacements={FALLBACK_PLACEMENTS}
                disabled={false}
                selection={tag.impliedTags}
                onSelect={tag.addImpliedTag}
                onDeselect={tag.removeImpliedTag}
                clearInputOnSelect={false}
                onClear={() => tag.replaceImpliedTags([])}
                multiline
                filter={(t) => !relatedTags.get().has(t)}
              />
              <br />
              <label className="dialog-label" htmlFor="tag-implyBy-picker">
                Tags that imply this tag
              </label>
              <TagSelector
                fallbackPlacements={FALLBACK_PLACEMENTS}
                disabled={false}
                selection={tag.impliedByTags}
                onSelect={tag.addImpliedByTag}
                onDeselect={tag.removeImpliedByTag}
                clearInputOnSelect={false}
                onClear={() => tag.replaceImpliedByTags([])}
                multiline
                filter={(t) => !relatedTags.get().has(t)}
              />
            </fieldset>
          </>
        ) : (
          <></>
        )}
      </div>
      <div className="dialog-actions">
        <Button text="Close" styling="filled" onClick={uiStore.closeTagPropertiesEditor} />
      </div>
    </Dialog>
  );
});
