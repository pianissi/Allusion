import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStore } from '../../contexts/StoreContext';
import UiStore from 'src/frontend/stores/UiStore';
import { Toggle } from 'widgets/checkbox';
import { Slider } from 'widgets/slider';

// moved the labes one item up to aling them visually in the ui
const pageSizeOptions = [
  { value: 0, label: '250' },
  { value: 250 },
  { value: 500, label: '1K' },
  { value: 1000 },
  { value: 1500, label: '2K' },
  { value: 2000 },
  { value: 2500, label: '3K' },
  { value: 3000 },
  { value: 3500, label: '4K' },
  { value: 4000 },
  { value: 4500, label: '5K' },
  { value: 5000 },
  { value: 5500, label: '6K' },
  { value: 6000 },
  { value: 6500, label: '7K' },
  { value: 7000 },
  { value: 7500, label: '8K' },
  { value: 8000 },
  { value: 8500, label: '9K' },
  { value: 9000 },
  { value: 9500, label: '10K' },
  { value: 10000 },
];

export const UsagePreferences = observer(() => {
  const { uiStore, fileStore } = useStore();
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      return;
    }
    fileStore.setPaginationSize(val);
  };

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
        <Toggle
          checked={uiStore.isIncludeSubtagsOnMatchEnabled}
          onChange={uiStore.toggleIncludeSubtagsOnMatch}
        >
          Include Sub-tags On Tag Selector Suggestion Matches
        </Toggle>
      </div>

      <h3>Gallery</h3>
      <div className="vstack">
        <div id="page-size-controllers-container">
          <Slider
            value={fileStore.paginationSize}
            label={
              <span>
                <b>Pagination Size:</b> Number of files initially loaded and when reaching the
                scroll edge.{' '}
                <span style={{ fontWeight: 'lighter' }}>
                  (This setting heavily impacts memory usage and performance)
                </span>
              </span>
            }
            onChange={fileStore.setPaginationSize}
            id="pagination-size-slider"
            options={pageSizeOptions}
            min={pageSizeOptions[0].value}
            max={pageSizeOptions[pageSizeOptions.length - 1].value}
            step={20}
            secondaryInput={
              <input
                type="number"
                className="input"
                value={fileStore.paginationSize}
                onChange={handleInputChange}
                step={20}
              />
            }
          />
        </div>
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
