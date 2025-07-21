import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';

import { Button, IconSet, Tag } from 'widgets';
import { Dialog } from 'widgets/popovers';
import { useStore } from '../../../contexts/StoreContext';
import { ClientTag } from '../../../entities/Tag';
import { TagSelector } from 'src/frontend/components/TagSelector';
import { Placement } from '@floating-ui/core';
import { AppToaster } from 'src/frontend/components/Toaster';

interface TagMoveToProps {
  tag: ClientTag;
  onClose: () => void;
}

const FALLBACK_PLACEMENTS: Placement[] = ['bottom'];

export const TagsMoveTo = observer(({ tag, onClose }: TagMoveToProps) => {
  const { uiStore } = useStore();
  const [selectedTag, setSelectedTag] = useState<ClientTag>();

  const ctxTags = uiStore.getTagContextItems(tag.id);
  const isMulti = ctxTags.length > 1;
  const plur = isMulti ? 's' : '';

  const handleMove = () => {
    let count = 0;
    if (selectedTag !== undefined) {
      ctxTags.reverse().forEach((tag) => {
        if (selectedTag.insertSubTag(tag, 0)) {
          count++;
        }
      });
    }
    // Call toaster asynchronously to ensure it appears after the action
    setTimeout(() => {
      AppToaster.show(
        {
          message: `${count} of ${ctxTags.length} tag${plur} moved successfully.`,
          timeout: 6000,
          type: count === ctxTags.length ? 'success' : 'warning',
        },
        'tag-move-toast',
      );
    }, 0);
    onClose();
  };

  return (
    <Dialog
      open
      title={`Move Tag${plur} Into Another Tag`}
      icon={IconSet.TAG_GROUP}
      onCancel={onClose}
      describedby="move-to-info"
    >
      <p id="move-to-info">
        This will move the chosen tag{plur} into the sub-tags of the tag you select below. <br />
        {isMulti && (
          <>Note: If some tags cannot be moved, they will be skipped and the rest will be moved.</>
        )}
      </p>
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <div id="tag-move-overview">
            <span>Tag{plur} to move:</span>
            <br />
            {ctxTags.map((tag) => (
              <Tag key={tag.id} text={tag.name} color={tag.viewColor} />
            ))}
          </div>

          <br />

          <label className="dialog-label" htmlFor="tag-move-picker">
            Move to
          </label>
          <TagSelector
            fallbackPlacements={FALLBACK_PLACEMENTS}
            disabled={false}
            selection={selectedTag ? [selectedTag] : []}
            onSelect={setSelectedTag}
            onDeselect={() => setSelectedTag(undefined)}
            onClear={() => setSelectedTag(undefined)}
            multiline
            filter={isMulti ? undefined : (t) => tag !== t && !t.isImpliedAncestor(tag)}
          />
        </fieldset>
        <br />
        <fieldset className="dialog-actions">
          <Button
            text="Move"
            styling="filled"
            disabled={selectedTag === undefined}
            onClick={handleMove}
          />
        </fieldset>
      </form>
    </Dialog>
  );
});
