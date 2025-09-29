import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStore } from '../../contexts/StoreContext';
import UiStore from 'src/frontend/stores/UiStore';
import { Toggle } from 'widgets/checkbox';

export const UsagePreferences = observer(() => {
  const { uiStore } = useStore();
  return (
    <>
      <h3>Tag Selectors</h3>
      <div className="vstack">
        <Toggle
          checked={uiStore.isClearTagSelectorsOnSelectEnabled}
          onChange={uiStore.toggleClearTagSelectorsOnSelect}
        >
          Clear Tag Search Text After Select
        </Toggle>
        <RecentTagsNumber />
      </div>
    </>
  );
});

const RecentTagsNumber = observer(() => {
  const { uiStore } = useStore();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    uiStore.setRecentlyUsedTagsMaxLength(value);
    // update recentlyUsedTags size
    uiStore.addRecentlyUsedTag();
  };

  return (
    <label>
      Maximum Number of Recently Used Tags to Remember
      <select value={uiStore.recentlyUsedTagsMaxLength} onChange={handleChange}>
        {[...Array(UiStore.MAX_RECENTLY_USED_TAGS + 1)].map((_, i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    </label>
  );
});
