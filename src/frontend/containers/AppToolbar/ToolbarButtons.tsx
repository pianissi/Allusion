import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStore } from 'src/frontend/contexts/StoreContext';
import { INTERACTION_PATH_ATTRIBUTE_NAME } from 'src/frontend/hooks/useScopeInteraction';
import { IconSet } from 'widgets/icons';
import { ToolbarButton } from 'widgets/toolbar';

export const FileTagEditorButton = observer(() => {
  const { uiStore } = useStore();
  if (!uiStore.toolbarButtonsVisibility['fileTags']) {
    return null;
  }
  return (
    <div {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}>
      <ToolbarButton
        id="file-tags-editor-button"
        icon={IconSet.TAG_LINE}
        onClick={uiStore.toggleFileTagsEditor}
        text="Tag selected files"
        tooltip="Add or remove tags from selected images"
      />
    </div>
  );
});

export const FileExtraPropertiesEditorButton = observer(() => {
  const { uiStore } = useStore();
  if (!uiStore.toolbarButtonsVisibility['extraProperties']) {
    return null;
  }
  return (
    <div {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}>
      <ToolbarButton
        id="file-extra-properties-editor-button"
        icon={IconSet.OUTLINER4}
        onClick={uiStore.toggleFileExtraPropertiesEditor}
        text="File extra properties"
        tooltip="Add or remove extra properties from selected images"
        {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}
      />
    </div>
  );
});

export const FileExifEditorButton = observer(() => {
  const { uiStore } = useStore();
  if (!uiStore.toolbarButtonsVisibility['info']) {
    return null;
  }
  return (
    <div {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}>
      <ToolbarButton
        id="file-exif-editor-button"
        icon={IconSet.META_INFO_2}
        onClick={uiStore.toggleFileExtifEditor}
        text="File info"
        tooltip="View or edit the info from the selected image"
        {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}
      />
    </div>
  );
});

export const InspectorButton = observer(() => {
  const { uiStore } = useStore();
  const isSlide = uiStore.isSlideMode;
  const name = isSlide ? 'slideInspector' : 'overviewInspector';
  if (!uiStore.toolbarButtonsVisibility[name]) {
    return null;
  }
  return (
    <ToolbarButton
      icon={IconSet.INFO}
      onClick={isSlide ? uiStore.toggleSlideInspector : uiStore.toggleOverviewInspector}
      checked={isSlide ? uiStore.isSlideInspectorOpen : uiStore.isOverviewInspectorOpen}
      text="Toggle the inspector panel"
      tooltip="Toggle the inspector panel"
    />
  );
});
