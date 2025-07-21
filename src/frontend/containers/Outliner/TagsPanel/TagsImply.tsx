import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';

import { Button, IconSet, Tag } from 'widgets';
import { Dialog } from 'widgets/popovers';
import { ClientTag } from '../../../entities/Tag';
import { TagSelector } from 'src/frontend/components/TagSelector';
import { Placement } from '@floating-ui/core';
import { computed } from 'mobx';

interface TagImplyProps {
  tag: ClientTag;
  onClose: () => void;
}

const FALLBACK_PLACEMENTS: Placement[] = ['bottom'];

export const TagImply = observer(({ tag, onClose }: TagImplyProps) => {
  const relatedTags = useMemo(
    () =>
      computed(() => {
        const impliedAncestors = tag.getImpliedAncestors();
        const impliedSubTags = tag.getImpliedSubTree();
        return new Set<ClientTag>([...impliedAncestors, ...impliedSubTags]);
      }),
    [tag],
  );

  return (
    <Dialog
      open
      title={'Modify Implied Tags'}
      icon={IconSet.TAG_GROUP}
      onCancel={onClose}
      describedby="imply-info"
    >
      <p id="imply-info">
        This allows you to modify the implied tags for a tag. <br />
        Note: You cannot imply a parent, child, inherited implied, or implied-by tag in order to
        avoid circular relationships and maintain a clearer structure.
      </p>
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <div id="tag-imply-overview">
            <span>Changing implied tags for </span>
            <Tag key={tag.id} text={tag.name} color={tag.viewColor} />
          </div>

          <br />

          <label className="dialog-label" htmlFor="tag-imply-picker">
            Imply tags
          </label>
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
        <br />
        <fieldset className="dialog-actions">
          <Button text="Close" styling="filled" onClick={onClose} />
        </fieldset>
      </form>
    </Dialog>
  );
});
