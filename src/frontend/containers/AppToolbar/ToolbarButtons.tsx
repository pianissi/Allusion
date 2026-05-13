import React from 'react';
import { useStore } from 'src/frontend/contexts/StoreContext';
import { INTERACTION_PATH_ATTRIBUTE_NAME } from 'src/frontend/hooks/useScopeInteraction';
import { IconSet } from 'widgets/icons';
import { ToolbarButton } from 'widgets/toolbar';

export const FileTagEditorButton = () => {
  const { uiStore } = useStore();
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
};

export const FileExtraPropertiesEditorButton = () => {
  const { uiStore } = useStore();
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
};

export const FileExifEditorButton = () => {
  const { uiStore } = useStore();
  return (
    <div {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}>
      <ToolbarButton
        id="file-exif-editor-button"
        icon={IconSet.INFO}
        onClick={uiStore.toggleFileExtifEditor}
        text="File info"
        tooltip="View or edit the info from the selected image"
        {...{ [INTERACTION_PATH_ATTRIBUTE_NAME]: 'floating-panel/file-tags-editor-button' }}
      />
    </div>
  );
};
