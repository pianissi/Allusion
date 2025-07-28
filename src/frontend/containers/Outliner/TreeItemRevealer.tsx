import { IExpansionState } from '../types';

export type ExpansionSetter = (
  val: IExpansionState | ((prev: IExpansionState) => IExpansionState),
  source?: any,
) => void;

export type ScrollToItemPromise = (dataId: string) => Promise<void>;

export default abstract class TreeItemRevealer {
  private setExpansion?: ExpansionSetter;
  private scrollToItem?: ScrollToItemPromise;

  /**
   * Sets the tree expansion handler and an optional scroll handler.
   *
   * @param setExpansion Function to update the expansion state.
   * @param scrollToItem Optional scroll handler, for example used in a virtualized tree where nodes are not mounted in the DOM and the default focus logic does not work.
   */
  protected initializeExpansion(setExpansion: ExpansionSetter, scrollToItem?: ScrollToItemPromise) {
    this.setExpansion = setExpansion;
    this.scrollToItem = scrollToItem;
  }

  /**
   * Expands all (sub)locations to the sublocation that contains the specified file, then focuses that (sub)location <li /> element.
   * @param dataIds List of items in hierarchy to the item to reveal. Item to reveal should be the last item.
   */
  protected revealTreeItem(dataIds: string[], source?: any) {
    if (!this.setExpansion) {
      throw new Error('TreeItemRevealer was not initialized!');
    }

    // For every item on its path to the item to reveal, expand it, and then scrollTo + focus the item
    this.setExpansion((exp) => {
      const newExpansionState = { ...exp };
      for (const id of dataIds) {
        newExpansionState[id] = true;
      }
      return newExpansionState;
    }, source);

    setTimeout(async () => {
      if (this.scrollToItem !== undefined) {
        await this.scrollToItem(dataIds[0]);
      }
      const dataId = encodeURIComponent(dataIds[0]);
      const elem = document.querySelector<HTMLLIElement>(`li[data-id="${dataId}"]`);
      if (elem) {
        // Smooth scroll + focus
        elem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        elem.focus({ preventScroll: true });
        // Scroll again after a while, in case it took longer to expand than expected
        setTimeout(
          () => elem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }),
          300,
        );
      } else {
        console.error('Couldnt find list element for TreeItem dataId', dataId, dataIds);
      }
    }, 200); // wait for items to expand
  }
}
