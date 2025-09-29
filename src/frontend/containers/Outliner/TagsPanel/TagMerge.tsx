import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';

import { Button, Checkbox, IconSet, Tag } from 'widgets';
import { Dialog } from 'widgets/popovers';
import { useStore } from '../../../contexts/StoreContext';
import { ClientTag } from '../../../entities/Tag';
import { Placement } from '@floating-ui/core';
import { TagSelector } from 'src/frontend/components/TagSelector';
import { Menu, MenuCheckboxItem } from 'widgets/menus';

interface TagMergeProps {
  tag: ClientTag;
  onClose: () => void;
}

const ADD_AS_ALIAS_ID = 'merge-add-as-alias';
const FALLBACK_PLACEMENTS: Placement[] = ['bottom'];

/** this component is only shown when all tags in the context do not have child-tags */
export const TagMerge = observer(({ tag, onClose }: TagMergeProps) => {
  const { tagStore, uiStore } = useStore();
  const [addAsAliasEnabled, setAddAsAlias] = useState(
    localStorage.getItem(ADD_AS_ALIAS_ID) == 'true',
  );

  useEffect(() => {
    localStorage.setItem(ADD_AS_ALIAS_ID, JSON.stringify(addAsAliasEnabled));
  }, [addAsAliasEnabled]);

  const ctxTags = uiStore.getTagContextItems(tag.id);

  const [selectedTag, setSelectedTag] = useState<ClientTag>();

  const mergingWithSelf = ctxTags.some((t) => t.id === selectedTag?.id);

  const merge = () => {
    if (selectedTag !== undefined && !mergingWithSelf) {
      for (const ctxTag of ctxTags) {
        tagStore.merge(ctxTag, selectedTag, addAsAliasEnabled);
      }
      onClose();
    }
  };

  const plur = ctxTags.length === 1 ? '' : 's';

  return (
    <Dialog
      open
      title={`Merge Tag${plur} With`}
      icon={IconSet.TAG_GROUP}
      onCancel={onClose}
      describedby="merge-info"
    >
      <p id="merge-info">
        This will replace all uses of the chosen tag{plur} with the tag you select below.
      </p>
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <div id="tag-merge-overview">
            <label className="dialog-label">Tag{plur} to merge:</label>
            <br />
            {ctxTags.map((tag) => (
              <Tag key={tag.id} text={tag.name} color={tag.viewColor} isHeader={tag.isHeader} />
            ))}
          </div>

          <br />
          <MenuCheckboxItem
            checked={addAsAliasEnabled}
            onClick={() => setAddAsAlias(!addAsAliasEnabled)}
            text={'Add merged tag as alias to the selected tag'}
          />
          <br />

          <label className="dialog-label" htmlFor="tag-merge-picker">
            Merge with
          </label>
          <TagSelector
            fallbackPlacements={FALLBACK_PLACEMENTS}
            disabled={false}
            selection={selectedTag ? [selectedTag] : []}
            onSelect={setSelectedTag}
            onDeselect={() => setSelectedTag(undefined)}
            onClear={() => setSelectedTag(undefined)}
            multiline
          />
          {mergingWithSelf && (
            <span className="form-error">You cannot merge a tag with itself.</span>
          )}
        </fieldset>
        <br />
        <fieldset className="dialog-actions">
          <Button
            text="Merge"
            styling="filled"
            onClick={merge}
            disabled={selectedTag === undefined || mergingWithSelf}
          />
        </fieldset>
      </form>
    </Dialog>
  );
});
