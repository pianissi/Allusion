import { observer } from 'mobx-react-lite';
import React, { useCallback, useMemo, useRef } from 'react';

import { Button, IconSet, Tag } from 'widgets';
import { Dialog } from 'widgets/popovers';
import { ClientTag } from '../../entities/Tag';
import { TagSelector } from 'src/frontend/components/TagSelector';
import { Placement } from '@floating-ui/core';
import { computed } from 'mobx';
import { InfoButton } from 'widgets/notifications';
import { ColorPickerMenu, TagVisibilityMenu } from './TagsPanel/ContextMenu';
import { Menu } from 'widgets/menus';
import { useStore } from 'src/frontend/contexts/StoreContext';

const FALLBACK_PLACEMENTS: Placement[] = ['bottom'];

export const TagPropertiesEditor = observer(() => {
  const { uiStore } = useStore();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tag = uiStore.tagToEdit;
  const isOpen = tag !== undefined;

  const handleNameBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement, Element>) => {
      const value = e.currentTarget.value.trim();
      if (value.length > 0) {
        tag?.rename(value);
      }
    },
    [tag],
  );
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const value = e.currentTarget.value.trim();
      if (e.key === 'Enter' && value.length > 0) {
        tag?.rename(value);
        nameInputRef.current?.blur();
      } else if (e.key === 'Escape') {
        // cancel with escape
        e.preventDefault();
        e.currentTarget.value = e.currentTarget.defaultValue;
        nameInputRef.current?.blur();
      }
    },
    [tag],
  );

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
            Edit properties of <Tag key={tag.id} text={tag.name} color={tag.viewColor} />
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
                onBlur={handleNameBlur}
                onKeyDown={handleNameKeyDown}
              />
            </fieldset>

            <br />

            <fieldset>
              <legend id="tag-name-label" className="dialog-section-label">
                Appearance
              </legend>
              <Menu>
                <TagVisibilityMenu tag={tag} />
                <ColorPickerMenu tag={tag} />
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
