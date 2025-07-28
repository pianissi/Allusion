import { IReactionDisposer, action, computed, makeObservable, observable, reaction } from 'mobx';

import { MAX_TAG_DEPTH } from '../../../common/config';
import { ID } from '../../api/id';
import { ROOT_TAG_ID, TagDTO } from '../../api/tag';
import TagStore from '../stores/TagStore';

/**
 * A Tag as it is stored in the Client.
 * It is stored in a MobX store, which can observe changed made to it and subsequently
 * update the entity in the backend.
 */
export class ClientTag {
  private store: TagStore;
  private saveHandler: IReactionDisposer;

  readonly id: ID;
  readonly dateAdded: Date;
  @observable name: string;
  @observable color: string;
  @observable isHidden: boolean;
  /** Whether a tag is marked as Visible when inherited */
  @observable isVisibleInherited: boolean;
  @observable private _parent: ClientTag | undefined;
  readonly subTags = observable<ClientTag>([]);
  @observable private readonly _impliedByTags = observable<ClientTag>([]);
  @observable private readonly _impliedTags = observable<ClientTag>([]);

  // Not observable but lighter and good enough for quick sorting in the UI.
  // Gets recalculated when TagStore.tagList is recomputed.
  flatIndex: number = 0;

  // icon, (fileCount?)

  /** The amount of files that has this tag assigned to it
   * TODO: would be nice to have the amount of files assigned to any of this tag's subtags too,
   * but we can't simply sum them, since there might be duplicates.
   * We'd need a Set of file-ids on every tag, and maintain them when a tag's parent changes.
   */
  @observable fileCount: number;

  constructor(
    store: TagStore,
    id: ID,
    name: string,
    dateAdded: Date,
    color?: string,
    isHidden?: boolean,
    isVisibleInherited?: boolean,
  ) {
    this.store = store;
    this.id = id;
    this.dateAdded = dateAdded;
    this.name = name;
    this.color = color ?? 'inherit';
    this.fileCount = 0;
    this.isHidden = isHidden ?? false;
    this.isVisibleInherited = isVisibleInherited ?? true;

    // observe all changes to observable fields
    this.saveHandler = reaction(
      // We need to explicitly define which values this reaction should react to
      () => this.serialize(),
      // Then update the entity in the database
      (tag) => {
        this.store.save(tag);
      },
      { delay: 500 },
    );

    makeObservable(this);
  }

  /** Get a number reference which changes if its sub hierarchy is updated */
  @computed get subtreeVersion(): number {
    for (let i = 0; i < this.subTags.length; i++) {
      // Touch dependencies explicitly
      this.subTags[i].subtreeVersion;
    }
    return performance.now();
  }

  /** Get actual tag objects based on the IDs retrieved from the backend */
  @computed get parent(): ClientTag {
    if (this._parent === undefined) {
      console.warn('Tag does not have a parent', this);
      return this.store.root;
    }
    return this._parent;
  }

  initImpliedTags(impliedTagIds: ID[]): void {
    if (this._impliedTags.length > 0) {
      return;
    }
    for (const id of impliedTagIds) {
      const impliedTag = this.store.get(id);
      if (impliedTag !== undefined) {
        this._impliedTags.push(impliedTag);
        impliedTag._impliedByTags.push(this);
      }
    }
  }

  /** Get actual "implied by" tag objects based on the IDs retrieved from the backend */
  @computed get impliedByTags(): ClientTag[] {
    return this._impliedByTags.slice();
  }

  /** Get actual "implied" tag objects based on the IDs retrieved from the backend */
  @computed get impliedTags(): ClientTag[] {
    return this._impliedTags.slice();
  }

  /** Returns this tag and all of its sub-tags ordered depth-first */
  @action getSubTree(): Generator<ClientTag> {
    function* tree(
      tag: ClientTag,
      depth: number,
      visited = new Set<ClientTag>(),
      path = new Set<ClientTag>(),
    ): Generator<ClientTag> {
      if (path.has(tag)) {
        tag.store.showTagToast(
          tag,
          'has circular relations with other tags',
          'tag-cicle-err',
          'error',
        );
        console.error(`Tag "${tag.name}" has circular relations with other tags`, tag);
      } else if (depth > MAX_TAG_DEPTH) {
        console.error('Subtree has too many tags. Maximum tag depth exceeded', tag);
        return;
      } else if (!visited.has(tag)) {
        path.add(tag);
        visited.add(tag);
        yield tag;
        for (const subTag of tag.subTags) {
          yield* tree(subTag, depth + 1, visited, path);
        }
        path.delete(tag);
      }
    }
    return tree(this, 0);
  }

  /** Returns this tag and all of its "implied By" sub-tags and their sub-tags ordered depth-first */
  @action getImpliedSubTree(): Generator<ClientTag> {
    function* tree(
      tag: ClientTag,
      depth: number,
      visited = new Set<ClientTag>(),
      path = new Set<ClientTag>(),
    ): Generator<ClientTag> {
      if (path.has(tag)) {
        tag.store.showTagToast(
          tag,
          'has circular implied relations with other tags',
          'tag-cicle-err',
          'error',
        );
        console.error(`Tag "${tag.name}" has circular implied relations with other tags`, tag);
      } else if (depth > MAX_TAG_DEPTH) {
        console.error('Subtree has too many tags. Maximum tag depth exceeded', tag);
      } else if (!visited.has(tag)) {
        path.add(tag);
        visited.add(tag);
        yield tag;
        for (const subTag of tag.subTags) {
          yield* tree(subTag, depth + 1, visited, path);
        }
        for (const subTag of tag._impliedByTags) {
          yield* tree(subTag, depth + 1, visited, path);
        }
        path.delete(tag);
      }
    }
    return tree(this, 0);
  }

  /**
   * Returns this tag and all its ancestors (excluding root tag).
   * @param visited Accepts an optional visited set to avoid redundant traversal across multiple calls (when resolving ancestors for many tags).
   */
  @action getAncestors(visited?: Set<ClientTag>): Generator<ClientTag> {
    function* ancestors(
      tag: ClientTag,
      depth: number,
      visited = new Set<ClientTag>(),
      path = new Set<ClientTag>(),
    ): Generator<ClientTag> {
      if (path.has(tag)) {
        tag.store.showTagToast(
          tag,
          'has circular relations with other tags',
          'tag-cicle-err',
          'error',
        );
        console.error(`Tag "${tag.name}" has circular relations with other tags`, tag);
      } else if (depth > MAX_TAG_DEPTH) {
        console.error('Tag has too many ancestors. Maximum tag depth exceeded', tag);
      } else if (tag.id !== ROOT_TAG_ID && !visited.has(tag)) {
        path.add(tag);
        visited.add(tag);
        yield tag;
        yield* ancestors(tag.parent, depth + 1, visited, path);
        path.delete(tag);
      }
    }
    return ancestors(this, 0, visited);
  }

  /**
   * Returns this tag and all its implied ancestors (excluding root tag).
   * @param visited Accepts an optional visited set to avoid redundant traversal across multiple calls (when resolving ancestors for many tags).
   */
  @action getImpliedAncestors(visited?: Set<ClientTag>): Generator<ClientTag> {
    function* ancestors(
      tag: ClientTag,
      depth: number,
      visited = new Set<ClientTag>(),
      path = new Set<ClientTag>(),
    ): Generator<ClientTag> {
      if (path.has(tag)) {
        tag.store.showTagToast(
          tag,
          'has circular implied relations with other tags',
          'tag-cicle-err',
          'error',
        );
        console.error(`Tag "${tag.name}" has circular implied relations with other tags`, tag);
      } else if (depth > MAX_TAG_DEPTH) {
        console.error('Tag has too many ancestors. Maximum tag depth exceeded', tag);
      } else if (tag.id !== ROOT_TAG_ID && !visited.has(tag)) {
        path.add(tag);
        visited.add(tag);
        yield tag;
        yield* ancestors(tag.parent, depth + 1, visited, path);
        for (const impliedTag of tag._impliedTags) {
          yield* ancestors(impliedTag, depth + 1, visited, path);
        }
        path.delete(tag);
      }
    }
    return ancestors(this, 0, visited);
  }

  @computed get impliedAncestors(): ClientTag[] {
    const arr = [];
    for (const val of this.getImpliedAncestors()) {
      arr.push(val);
    }
    return arr;
  }

  /** Returns the tags up the hierarchy from this tag, excluding the root tag */
  @computed get path(): string[] {
    return Array.from(this.getAncestors(), (t) => t.name).reverse();
  }

  @computed get pathCharLength(): number {
    let total = 0;
    for (let i = 0; i < this.path.length; i++) {
      total += this.path[i].length;
    }
    return total;
  }

  get isSelected(): boolean {
    return this.store.isSelected(this);
  }

  @computed get viewColor(): string {
    for (const tag of this.getAncestors()) {
      if (tag.color !== 'inherit') {
        return tag.color;
      }
    }
    return this.store.root.color;
  }

  @computed get isSearched(): boolean {
    return this.store.isSearched(this);
  }

  /**
   * Returns true if tag is an ancestor of this tag.
   * @param tag possible ancestor node
   */
  @action isAncestor(tag: ClientTag): boolean {
    if (this === tag) {
      return false;
    }
    for (const ancestor of this.parent.getAncestors()) {
      if (ancestor === tag) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns true if tag is an implied ancestor of this tag.
   * @param tag possible ancestor node
   */
  @action isImpliedAncestor(tag: ClientTag): boolean {
    if (this === tag) {
      return false;
    }
    for (const ancestor of this.getImpliedAncestors()) {
      if (ancestor === tag) {
        return true;
      }
    }
    return false;
  }

  @action setParent(parent: ClientTag): void {
    this._parent = parent;
  }

  @action.bound rename(name: string): void {
    this.name = name;
  }

  @action.bound setColor(color: string): void {
    this.color = color;
  }

  @action.bound insertSubTag(tag: ClientTag, at: number): boolean {
    let errorMsg = undefined;
    if (this === tag || tag.id === ROOT_TAG_ID) {
      errorMsg = 'cannot be inserted into itself.';
    } else if (this.isAncestor(tag)) {
      errorMsg = 'cannot be inserted into one of its own sub-tags.';
    } else if (this.isImpliedAncestor(tag)) {
      errorMsg = 'cannot be inserted into another that already implies it.';
    }
    if (errorMsg) {
      this.store.showTagToast(tag, errorMsg, 'tag-insert-err', 'error', 6000);
      return false;
    }

    // Move to different pos in same parent: Reorder tag.subTags and return
    if (this === tag.parent) {
      const currentIndex = this.subTags.indexOf(tag);
      if (currentIndex !== at && at >= 0 && at <= this.subTags.length) {
        // If moving below current position, take into account removing self affecting the index
        const newIndex = currentIndex < at ? at - 1 : at;
        this.subTags.remove(tag);
        this.subTags.splice(newIndex, 0, tag);
      }
    } else {
      // Insert subTag into tag
      tag.parent.subTags.remove(tag);
      if (at >= 0 && at < this.subTags.length) {
        this.subTags.splice(at, 0, tag);
      } else {
        this.subTags.push(tag);
      }
      tag.setParent(this);
    }
    return true;
  }

  @action.bound replaceImpliedTags(newTags: ClientTag[]): void {
    //convert to set for efficient comparison and avoid duplicates
    const newTagsSet = new Set(newTags);

    for (const tag of this._impliedTags.slice()) {
      if (!newTagsSet.has(tag)) {
        this.removeImpliedTag(tag);
      }
    }

    for (const tag of newTagsSet) {
      if (!this._impliedTags.includes(tag)) {
        this.addImpliedTag(tag);
        this.store.addRecentlyUsedTag(tag);
      }
    }
  }

  @action.bound replaceImpliedByTags(newTags: ClientTag[]): void {
    //convert to set for efficient comparison and avoid duplicates
    const newTagsSet = new Set(newTags);

    for (const tag of this._impliedByTags.slice()) {
      if (!newTagsSet.has(tag)) {
        tag.removeImpliedTag(this);
      }
    }

    for (const tag of newTagsSet) {
      if (!this._impliedByTags.includes(tag)) {
        tag.addImpliedTag(this);
        this.store.addRecentlyUsedTag(tag);
      }
    }
  }

  @action.bound addImpliedTag(tag: ClientTag): boolean {
    let errorMsg = '';
    if (this === tag || tag.id === ROOT_TAG_ID) {
      errorMsg = 'cannot imply itself.';
    } else if (tag.isImpliedAncestor(this)) {
      errorMsg = `cannot imply a tag that already implies "${this.name}" (would create a circular relation).`;
    } else if (this.isImpliedAncestor(tag)) {
      errorMsg = `already implies the "${tag.name}" tag. (possibly through an inherited implication)`;
    }
    if (errorMsg) {
      this.store.showTagToast(this, errorMsg, 'tag-imply-err', 'error', 6000);
      return false;
    }

    if (!this._impliedTags.includes(tag)) {
      this._impliedTags.push(tag);
      tag._impliedByTags.push(this);
    }
    return true;
  }

  @action.bound addImpliedByTag(tag: ClientTag): void {
    tag.addImpliedTag(this);
  }

  @action.bound removeImpliedTag(tag: ClientTag): void {
    const index = this._impliedTags.indexOf(tag);
    const impliedBy_index = tag._impliedByTags.indexOf(this);
    if (index !== -1) {
      this._impliedTags.splice(index, 1);
    }
    if (impliedBy_index !== -1) {
      tag._impliedByTags.splice(impliedBy_index, 1);
    }
  }

  @action.bound removeImpliedByTag(tag: ClientTag): void {
    tag.removeImpliedTag(this);
  }

  @action.bound incrementFileCount(amount = 1): void {
    this.fileCount += amount;
  }

  @action.bound decrementFileCount(amount = 1): void {
    this.fileCount -= amount;
  }

  @action.bound toggleHidden(): void {
    this.isHidden = !this.isHidden;
    this.store.refetchFiles();
  }

  @action.bound setVisibleInherited(val: boolean): void {
    this.isVisibleInherited = val;
  }

  /**
   * Similar to this.isVisibleInherited but
   * takes into account inheritedTagsVisibilityMode from UiStore
   */
  @computed get shouldShowWhenInherited(): boolean {
    return this.store.shouldShowWhenInherited(this);
  }

  serialize(): TagDTO {
    return {
      id: this.id,
      name: this.name,
      dateAdded: this.dateAdded,
      color: this.color,
      subTags: this.subTags.map((subTag) => subTag.id),
      isHidden: this.isHidden,
      impliedTags: this._impliedTags.map((impliedTag) => impliedTag.id),
      isVisibleInherited: this.isVisibleInherited,
    };
  }

  async delete(): Promise<void> {
    return this.store.delete(this);
  }

  dispose(): void {
    // clean up the observer
    this.saveHandler();
  }
}
