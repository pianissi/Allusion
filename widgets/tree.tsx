/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React, {
  CSSProperties,
  ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// --- Helper function for tree items ---

const setTabFocus = (element: HTMLElement, preventScroll = true) => {
  element.setAttribute('tabIndex', '0');
  element.focus({ preventScroll }); // CHROME BUG: Option is ignored, probably fixed in Electron 9.
};

const refocus = (previousTarget: Element, nextTarget: HTMLElement) => {
  previousTarget.setAttribute('tabIndex', '-1');
  setTabFocus(nextTarget, false); // scroll is nice to have here: otherwise elements might go out of view
};

const isGroup = (element: Element | null) => element?.matches('[role="group"]');

const isExpanded = (element: Element | null) => element?.matches('[aria-expanded="true"]');

const getParent = (element: Element): HTMLElement | null =>
  isGroup(element.parentElement) ? element.parentElement!.parentElement!.parentElement : null;

const getFirstChild = (element: Element): Element | null =>
  isExpanded(element) && isGroup(element.lastElementChild!.lastElementChild)
    ? element.lastElementChild!.lastElementChild!.firstElementChild
    : null;

const getLastDescendant = (element: Element): Element | null => {
  if (isExpanded(element) && isGroup(element.lastElementChild!.lastElementChild)) {
    const last = element.lastElementChild!.lastElementChild!.lastElementChild;
    if (last) {
      return getLastDescendant(last);
    }
  }
  return element;
};

const getNextSibling = (element: Element): Element | null => {
  if (!element.nextElementSibling) {
    const parent = getParent(element);
    if (parent) {
      return getNextSibling(parent);
    }
  }
  return element.nextElementSibling;
};

// --- Keyboard Interaction ---

type KeyDownEventHandler = (
  event: React.KeyboardEvent<HTMLLIElement>,
  nodeData: any,
  treeData: any,
) => void;

const KeyboardSpaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, repeat: false });

const shiftKeyFocus = (shiftKey: boolean, current: HTMLElement | null, target: Element) => {
  if (current) {
    if (shiftKey) {
      current.dispatchEvent(KeyboardSpaceEvent);
    }
    refocus(target, current);
  }
};

const keyFocus = (current: HTMLElement | null, target: Element) => {
  if (current) {
    refocus(target, current);
  }
};

/**
 * Function factory handling keyDown event on leaves
 *
 * The event is ONLY triggered when a tree item is focused. If you need other
 * behaviour, you should write the key event handler from scratch. This might
 * seem restrictive but prevents text input accidentially triggering events.
 */
export const createLeafOnKeyDown = (
  event: React.KeyboardEvent<HTMLLIElement>,
  nodeData: any,
  treeData: any,
  toggleSelection: (nodeData: any, treeData: any) => void,
  onKeyDown?: KeyDownEventHandler,
) => {
  // We only want to trigger those events when the tree item is focused!
  if (event.currentTarget !== event.target) {
    return;
  }
  const leaf = event.currentTarget;
  switch (event.key) {
    case ' ':
      event.stopPropagation();
      toggleSelection(nodeData, treeData);
      break;

    case 'ArrowDown':
      event.stopPropagation();
      event.preventDefault(); // prevent scroll
      shiftKeyFocus(event.shiftKey, getNextSibling(leaf) as HTMLElement, leaf);
      break;

    case 'ArrowUp': {
      event.stopPropagation();
      event.preventDefault(); // prevent scroll
      const prev = leaf.previousElementSibling
        ? getLastDescendant(leaf.previousElementSibling)
        : getParent(leaf);
      shiftKeyFocus(event.shiftKey, prev as HTMLElement, leaf);
      break;
    }

    case 'ArrowLeft':
      event.stopPropagation();
      keyFocus(getParent(leaf), leaf);
      break;

    default:
      onKeyDown?.(event, nodeData, treeData);
      break;
  }
};

const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
  if (event.target instanceof Element && !event.target.matches('[role="treeitem"]')) {
    return;
  }
  switch (event.key) {
    case 'Home': {
      const prev = event.currentTarget.querySelector('[role="treeitem"][tabindex="0"]');
      setTabFocus(event.currentTarget.firstElementChild as HTMLElement);
      if (prev) {
        prev.setAttribute('tabIndex', '-1');
      }
      break;
    }

    case 'End': {
      const prev = event.currentTarget.querySelector('[role="treeitem"][tabindex="0"]');
      const last = getLastDescendant(event.currentTarget.lastElementChild!);
      setTabFocus(last as HTMLElement);
      if (prev) {
        prev.setAttribute('tabIndex', '-1');
      }
      break;
    }

    default:
      break;
  }
};

/**
 * Function factory handling keyDown event on branches
 *
 * The event is ONLY triggered when a tree item is focused. If you need other
 * behaviour, you should write the key event handler from scratch. This might
 * seem restrictive but prevents text input accidentially triggering events.
 */
export const createBranchOnKeyDown = (
  event: React.KeyboardEvent<HTMLLIElement>,
  nodeData: any,
  treeData: any,
  isExpanded: (nodeData: any, treeData: any) => boolean,
  toggleSelection: (nodeData: any, treeData: any) => void,
  toggleExpansion: (nodeData: any, treeData: any, event?: React.MouseEvent) => void,
  onKeyDown?: KeyDownEventHandler,
) => {
  // We only want to trigger those events when the tree item is focused!
  if (event.currentTarget !== event.target) {
    return;
  }
  const branch = event.currentTarget;
  switch (event.key) {
    case ' ':
      event.stopPropagation();
      toggleSelection(nodeData, treeData);
      break;

    case 'ArrowDown': {
      event.stopPropagation();
      event.preventDefault(); // prevent scroll
      const next = getFirstChild(branch) ?? getNextSibling(branch);
      shiftKeyFocus(event.shiftKey, next as HTMLElement, branch);
      break;
    }

    case 'ArrowUp': {
      event.stopPropagation();
      event.preventDefault(); // prevent scroll
      const prev = branch.previousElementSibling
        ? getLastDescendant(branch.previousElementSibling)
        : getParent(branch);
      shiftKeyFocus(event.shiftKey, prev as HTMLElement, branch);
      break;
    }

    case 'ArrowRight':
      event.stopPropagation();
      if (isExpanded(nodeData, treeData)) {
        keyFocus(getFirstChild(branch) as HTMLElement, branch);
      } else {
        toggleExpansion(nodeData, treeData);
      }
      break;

    case 'ArrowLeft':
      event.stopPropagation();
      if (isExpanded(nodeData, treeData)) {
        toggleExpansion(nodeData, treeData);
      } else {
        keyFocus(getParent(branch), branch);
      }
      break;

    default:
      onKeyDown?.(event, nodeData, treeData);
      break;
  }
};

// --- Low Level Interface --

/** Representation of Node Data */
export interface INodeData {
  /** A unique key identifier used as the key value for React components */
  id: string;
  /** Pointer to addionally related data */
  nodeData: any;
  /**
   * Checks the selection state of a node
   *
   * Returning true or false determines the selection state of a node. If the
   * tree has only single selection, undefined should be returned for
   * unselected nodes.
   * */
  isSelected?: (nodeData: any, treeData: any) => boolean;
}

/** Internal Node Representation */
interface ITreeNode extends INodeData {
  dataId: string;
  className?: string;
  label: TreeLabel;
  level: number;
  size: number;
  pos: number;
  treeData: any;
  onLeafKeyDown?: KeyDownEventHandler;
}

type ILeaf = ITreeNode;

interface IBranch extends ITreeNode {
  ancestorVisible: boolean;
  overScan: number;
  isExpanded: (nodeData: any, treeData: any) => boolean;
  toggleExpansion: (nodeData: any, treeData: any, event: React.MouseEvent) => void;
  children: ITreeItem[];
  expansionSize?: number;
  onBranchKeyDown?: KeyDownEventHandler;
}

const TreeLeaf = React.memo(TreeLeafComponent);
function TreeLeafComponent({
  label: Label,
  isSelected,
  level,
  size,
  pos,
  nodeData,
  treeData,
  onLeafKeyDown,
  className = '',
  dataId,
}: ILeaf) {
  return (
    <li
      className={className}
      aria-level={level}
      aria-setsize={size}
      aria-posinset={pos}
      aria-selected={isSelected?.(nodeData, treeData)}
      onKeyDown={(e) => onLeafKeyDown?.(e, nodeData, treeData)}
      role="treeitem"
      tabIndex={-1}
      data-id={encodeURIComponent(dataId)}
    >
      <div
        className="label"
        style={{ '--connector-size': size === pos ? 0.5 : 1 } as React.CSSProperties}
      >
        <div className="spacer"></div>
        {typeof Label === 'string' ? (
          Label
        ) : (
          <Label nodeData={nodeData} treeData={treeData} level={level} size={size} pos={pos} />
        )}
      </div>
    </li>
  );
}

const TreeBranch = React.memo(TreeBranchComponent);
function TreeBranchComponent({
  ancestorVisible,
  overScan,
  children,
  label: Label,
  level,
  size,
  pos,
  nodeData,
  treeData,
  isExpanded,
  isSelected,
  toggleExpansion,
  onBranchKeyDown,
  onLeafKeyDown,
  className = '',
  dataId,
}: IBranch) {
  const transition = useRef<HTMLDivElement | null>(null);
  const expanded = isExpanded(nodeData, treeData);
  const [end, setEnd] = useState<number | undefined>(expanded ? undefined : overScan);

  // TODO: Try transitionrun/transitionstart instead on ul element.
  useLayoutEffect(() => {
    if (transition.current) {
      if (expanded) {
        setEnd(undefined);
        transition.current.style.maxHeight = '';
      } else {
        transition.current.style.maxHeight = transition.current.clientHeight + 'px';
      }
    }
  }, [expanded]);

  return (
    <li
      className={className}
      role="treeitem"
      tabIndex={-1}
      aria-expanded={expanded}
      aria-selected={isSelected?.(nodeData, treeData)}
      aria-level={level}
      aria-setsize={size}
      aria-posinset={pos}
      onKeyDown={(e) => onBranchKeyDown?.(e, nodeData, treeData)}
      data-id={encodeURIComponent(dataId)}
    >
      <div
        className="label"
        style={{ '--connector-size': size === pos ? 0.5 : 1 } as React.CSSProperties}
      >
        <div
          className="default_caret"
          aria-pressed={expanded}
          aria-label="Expand"
          onClick={(e) => toggleExpansion(nodeData, treeData, e)}
        />
        {typeof Label === 'string' ? (
          Label
        ) : (
          <Label nodeData={nodeData} treeData={treeData} level={level} size={size} pos={pos} />
        )}
      </div>
      <div className="transition" style={{ maxHeight: 0 }} ref={transition}>
        <ul
          style={{ '--level': level } as React.CSSProperties}
          role="group"
          onTransitionEnd={(e) => {
            if (!expanded) {
              e.stopPropagation();
              setEnd(overScan);
            }
          }}
        >
          {children
            .slice(0, ancestorVisible ? end : 0)
            .map((c, i) =>
              c.children.length > 0 ? (
                <TreeBranch
                  {...c}
                  ancestorVisible={expanded}
                  overScan={overScan}
                  key={c.id}
                  dataId={c.id}
                  level={level + 1}
                  size={children.length}
                  pos={i + 1}
                  toggleExpansion={toggleExpansion}
                  onBranchKeyDown={onBranchKeyDown}
                  onLeafKeyDown={onLeafKeyDown}
                  treeData={treeData}
                />
              ) : (
                <TreeLeaf
                  {...c}
                  key={c.id}
                  dataId={c.id}
                  level={level + 1}
                  size={children.length}
                  pos={i + 1}
                  onLeafKeyDown={onLeafKeyDown}
                  treeData={treeData}
                />
              ),
            )}
        </ul>
      </div>
    </li>
  );
}

// --- Public API ---

export interface ITree {
  id?: string;
  /** Element id of the tree view used for the aria-labelledby attribute */
  labelledBy?: string;
  /** Sets the aria-multiselectable attribute */
  multiSelect?: boolean;
  /** CSS class passed to the tree container element */
  className?: string;
  /** Children nodes */
  children: ITreeItem[];
  /** Toggles the expansion of a parent node */
  toggleExpansion: (nodeData: any, treeData: any, event: React.MouseEvent) => void;
  /** `onKeyDown` Event Handler for branch nodes (see `createBranchOnKeyDown`) */
  onLeafKeyDown?: KeyDownEventHandler;
  /** `onKeyDown` Event Handler for leaf nodes (see `createLeafOnKeyDown`) */
  onBranchKeyDown?: KeyDownEventHandler;
  /**
   * Pointer to external data
   *
   * This can be thought of similar to the `nodeData` props as a simple void
   * pointer like in the C programming language. This pointer is then casted to
   * its actual type and then used. TypeScript generics and React components do
   * not mesh well, which is why this kind of API exists.
   *
   * In this pointer you can store any kind of data that is then passed to the
   * internal components and visible as parameters in callback function. This
   * avoids excessive memoization attempts of dispatch functions and recreating
   * the tree structure from scratch. However, it is easier to mess up things.
   * As a tip, callbacks can use interfaces instead of `any` for `nodeData` and
   * `treeData` without TypeScript complaining.
   *
   * Furthermore, not only (observable) state but also setters/dispatchers can
   * be passed instead of memoized functions and accessed instead inside the
   * provided callbacks. This is in combination with the `useReducer` hook very
   * powerful.
   */
  treeData: any;
  /**
   * Number of pre-rendered items
   *
   * This component uses simple performance optimizations to keep overall
   * memory usage low. Only expanded and visible parent nodes render their
   * children. However, in order to preserve smooth a expansion animation, some
   * children are pre-rendered. The default is 2 and can be set to a
   * non-negative number through this property.
   */
  overScan?: number;
}

export interface ITreeLabel {
  nodeData: any;
  treeData: any;
  level: number;
  size: number;
  pos: number;
}

export type TreeLabel =
  | React.FC<{ nodeData: any; treeData: any; level: number; size: number; pos: number }>
  | string;

/** Presentation for branch nodes */
export interface ITreeItem extends INodeData {
  /** Actual rendered label */
  label: TreeLabel;
  /** CSS class added to a tree item */
  className?: string;
  /** Child nodes */
  children: ITreeItem[];
  /** Checks whether a parent node is open or closed */
  isExpanded: (nodeData: any, treeData: any) => boolean;
}

const handleFocus = (event: React.FocusEvent<HTMLUListElement>) => {
  if (!event.target.matches('[role="treeitem"]')) {
    return;
  }
  const prev = event.currentTarget.querySelector('li[role="treeitem"][tabindex="0"]');
  if (prev) {
    if (event.target !== prev) {
      refocus(prev as HTMLElement, event.target);
    }
  } else {
    setTabFocus(event.target);
  }
};

const Tree = React.memo(TreeComponent);
function TreeComponent({
  id,
  className = '',
  multiSelect,
  labelledBy,
  children,
  treeData,
  onBranchKeyDown,
  onLeafKeyDown,
  toggleExpansion,
  overScan = 2,
}: ITree) {
  const tree = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (tree.current?.firstElementChild) {
      tree.current.firstElementChild.setAttribute('tabIndex', '0');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length > 0]);

  return (
    <ul
      id={id}
      style={{ '--level': 0 } as CSSProperties}
      className={className}
      ref={tree}
      role="tree"
      aria-labelledby={labelledBy}
      aria-multiselectable={multiSelect}
      onKeyDown={handleTreeKeyDown}
      onFocus={handleFocus}
    >
      {children.map((c, i) =>
        c.children.length > 0 ? (
          <TreeBranch
            {...c}
            ancestorVisible
            overScan={overScan}
            key={c.id}
            dataId={c.id}
            level={1}
            size={children.length}
            pos={i + 1}
            onBranchKeyDown={onBranchKeyDown}
            onLeafKeyDown={onLeafKeyDown}
            toggleExpansion={toggleExpansion}
            treeData={treeData}
          />
        ) : (
          <TreeLeaf
            {...c}
            key={c.id}
            dataId={c.id}
            level={1}
            size={children.length}
            pos={i + 1}
            onLeafKeyDown={onLeafKeyDown}
            treeData={treeData}
          />
        ),
      )}
    </ul>
  );
}

export default Tree;

/////// Virtualized Tree ////////

import { FixedSizeList, ListChildComponentProps } from 'react-window'; //ListOnItemsRenderedProps

function flattenTree(
  tree: ITreeItem[],
  treeData: any,
  onLeafKeyDown: ILeaf['onLeafKeyDown'],
  onBranchKeyDown: IVBranch['onBranchKeyDown'],
  toggleExpansion: IVBranch['toggleExpansion'],
  animateToggleExpansion: IVBranch['animateToggleExpansion'],
  level = 0,
): ITreeNode[] {
  const flatList: ITreeNode[] = [];

  tree.forEach((node, index) => {
    if (node.children.length > 0) {
      const item: IVBranch = {
        ...node,
        toggleExpansion: toggleExpansion,
        onBranchKeyDown: onBranchKeyDown,
        animateToggleExpansion: animateToggleExpansion,
        ancestorVisible: true,
        overScan: 2,
        dataId: node.id,
        treeData,
        level,
        pos: index + 1,
        size: tree.length,
      };
      const isExpanded = node.isExpanded(node.nodeData, treeData);
      if (isExpanded) {
        const fl = flattenTree(
          node.children,
          treeData,
          onLeafKeyDown,
          onBranchKeyDown,
          toggleExpansion,
          animateToggleExpansion,
          level + 1,
        );
        item.expansionSize = fl.length + 1;
        flatList.push(item);
        flatList.push(...fl);
      } else {
        flatList.push(item);
      }
    } else {
      const item: ILeaf = {
        ...node,
        onLeafKeyDown: onLeafKeyDown,
        dataId: node.id,
        treeData,
        level,
        pos: index + 1,
        size: tree.length,
      };
      flatList.push(item);
    }
  });

  return flatList;
}

interface IVirtualizedTreeNode extends ITreeNode {
  childrenNodes?: ITreeItem[];
  onKeyDown?: KeyDownEventHandler;
  children?: React.ReactNode;
  expanded?: boolean;
  expansionSize?: number;
  style?: React.CSSProperties;
}

function VirtualizedTreeNode({
  label: Label,
  level,
  size,
  pos,
  nodeData,
  treeData,
  childrenNodes,
  isSelected,
  className = '',
  dataId,
  onKeyDown,
  children,
  expanded,
  expansionSize,
  style,
}: IVirtualizedTreeNode) {
  const ref = useRef<HTMLLIElement>(null);
  const isMounted = useRef(false);
  const selected = isSelected?.(nodeData, treeData);
  const conectorSize =
    size === pos ? 0.5 : expanded && childrenNodes && childrenNodes.length > 0 ? expansionSize : 1;

  useLayoutEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const el = ref.current;
    if (el) {
      el.classList.add('is-moving');
      setTimeout(() => {
        el.classList.remove('is-moving');
      }, 150);
    }
  }, [style?.top]);

  return (
    <li
      ref={ref}
      style={
        {
          ...style,
          '--level': level,
        } as React.CSSProperties
      }
      className={className}
      role="treeitem"
      tabIndex={-1}
      aria-expanded={expanded}
      aria-selected={selected}
      aria-level={level}
      aria-setsize={size}
      aria-posinset={pos}
      onKeyDown={(e) => onKeyDown?.(e, nodeData, treeData)}
      data-id={encodeURIComponent(dataId)}
    >
      <div
        className="label"
        style={
          {
            '--connector-size': conectorSize,
          } as React.CSSProperties
        }
      >
        {children}
        {typeof Label === 'string' ? (
          Label
        ) : (
          <Label nodeData={nodeData} treeData={treeData} level={level} size={size} pos={pos} />
        )}
      </div>
    </li>
  );
}

interface IVBranch extends IBranch {
  animateToggleExpansion: (
    index: number,
    isExpanded: boolean,
    expansionSize?: number,
  ) => Promise<void>;
}

const VirtualizedTreeBranch = React.memo(VirtualizedTreeBranchComponent);
function VirtualizedTreeBranchComponent(
  props: IVBranch & { index: number; style?: React.CSSProperties },
) {
  const {
    isExpanded,
    toggleExpansion,
    animateToggleExpansion,
    nodeData,
    treeData,
    index,
    expansionSize,
  } = props;
  const expanded = isExpanded(nodeData, treeData);
  const handleToggleExpansion = async (event: React.MouseEvent) => {
    await animateToggleExpansion(index, expanded, expansionSize);
    toggleExpansion(nodeData, treeData, event);
  };

  return (
    <VirtualizedTreeNode
      {...props}
      childrenNodes={props.children}
      expanded={expanded}
      onKeyDown={props.onBranchKeyDown}
    >
      <div
        className="default_caret"
        aria-pressed={expanded}
        aria-label="Expand"
        onClick={(e) => handleToggleExpansion(e)}
      />
    </VirtualizedTreeNode>
  );
}

const VirtualizedTreeLeaf = React.memo(VirtualizedTreeLeafComponent);
function VirtualizedTreeLeafComponent(props: ILeaf & { style?: React.CSSProperties }) {
  return (
    <VirtualizedTreeNode {...props} onKeyDown={props.onLeafKeyDown}>
      <div className="spacer" />
    </VirtualizedTreeNode>
  );
}

const VirtualizedTreeRow = ({ data, index, style }: ListChildComponentProps<ITreeNode[]>) => {
  const node = data[index];

  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    return <VirtualizedTreeBranch {...(node as IVBranch)} index={index} style={style} />;
  } else {
    return <VirtualizedTreeLeaf {...node} style={style} />;
  }
};

const itemKey = (index: number, data: ITreeNode[]) => data[index].id;

export type ScrollAlignment = 'center' | 'start' | 'end' | 'smart';
export type ScorllBehavior = 'smooth' | 'auto';
export interface VirtualizedTreeHandle {
  listRef: FixedSizeList | null;
  scrollToItemById: (
    dataId: string,
    alignment?: ScrollAlignment,
    behavior?: ScorllBehavior,
    IdxOffset?: number,
  ) => Promise<void>;
}

const VirtualizedTreeComponent = forwardRef(function VirtualizedTreeComponent(
  {
    id,
    className = '',
    multiSelect,
    labelledBy,
    children,
    treeData,
    onBranchKeyDown,
    onLeafKeyDown,
    toggleExpansion,
    footer,
  }: ITree & { footer?: React.ReactNode },
  ref: ForwardedRef<VirtualizedTreeHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLUListElement>(null);
  const hiderRef = useRef<HTMLLIElement>(null);
  const [contSize, setContSize] = useState({ width: 0, height: 0 });
  const [listHeight, setListHeight] = useState(0);
  const contHeightRef = useRef(0);
  //const listRenderIndexes = useRef<ListOnItemsRenderedProps>({
  //  overscanStartIndex: 0,
  //  overscanStopIndex: 0,
  //  visibleStartIndex: 0,
  //  visibleStopIndex: 0,
  //});
  const measureItemRef = useRef<HTMLDivElement>(null);
  const [itemHeight, setItemHeight] = useState(30);

  useEffect(() => {
    if (bodyRef.current?.firstElementChild) {
      bodyRef.current.firstElementChild.setAttribute('tabIndex', '0');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length > 0]);

  const animateToggleExpansion = useCallback(
    async (index: number, isExpanded: boolean, expansionLength?: number) => {
      const hider = hiderRef.current;
      if (!hider) {
        return;
      }
      const expansionStart = (index + 1) * itemHeight;
      if (isExpanded) {
        // expansionLength includes the actual node, so subtract 1
        const expansionSize = Math.min(
          ((expansionLength ?? 1) - 1) * itemHeight,
          contHeightRef.current,
        );
        hider.classList.value = '';
        hider.style.setProperty('top', `${expansionStart}px`);
        hider.style.setProperty('height', `${expansionSize}px`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        hider.classList.add('hider-expand');
        // await return to make .hider-expand animation start before [role='treeitem'] transition
        // to avoid blinking.
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        void (async () => {
          const expansionSize = contHeightRef.current - expansionStart;
          hider.classList.value = '';
          hider.style.setProperty('top', `${expansionStart}px`);
          hider.style.setProperty('height', `${expansionSize}px`);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          hider.classList.add('hider-collapse');
        })();
      }
    },
    [itemHeight],
  );

  const flattened = useMemo(
    () =>
      flattenTree(
        children,
        treeData,
        onLeafKeyDown,
        onBranchKeyDown,
        toggleExpansion,
        animateToggleExpansion,
      ),
    [animateToggleExpansion, children, onBranchKeyDown, onLeafKeyDown, toggleExpansion, treeData],
  );
  const measureNode = flattened.at(0);

  const scrollToItemById = useCallback(
    (
      dataId: string,
      alignment: ScrollAlignment = 'center',
      behavior: ScrollBehavior = 'smooth',
      IdxOffset: number = 0,
    ): Promise<void> => {
      return new Promise((resolve) => {
        const index = flattened.findIndex((tn) => tn.dataId === dataId) + IdxOffset;
        const outer = outerRef.current;
        if (index === -1 || !outer) {
          console.error('Couldnt find virtualized tree element for TreeNode dataId', dataId);
          return resolve();
        }
        let timeoutId: ReturnType<typeof setTimeout>;
        const handleScroll = () => {
          // If no scroll event happens for 250ms, consider the scroll finished and resolve.
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            outer.removeEventListener('scroll', handleScroll);
            resolve();
            // wait 250ms to give virtualizedTree time to render the nodes.
          }, 250);
        };
        let top: number | null = null;
        const itemTop = index * itemHeight;
        const itemBottom = itemTop + itemHeight;
        switch (alignment) {
          case 'start':
            top = itemTop;
            break;
          case 'end':
            top = itemBottom - contSize.height;
            break;
          case 'smart':
            const visibleTop = outer.scrollTop;
            if (itemTop < visibleTop) {
              top = itemTop; // scroll up
            } else if (itemBottom > visibleTop + contSize.height) {
              top = itemBottom - contSize.height; // scroll down
            } else {
              top = null; // already fully visible, no scroll needed
            }
            break;
          case 'center':
          default:
            top = itemTop - contSize.height / 2 + itemHeight / 2;
            break;
        }
        if (top !== null) {
          outer.addEventListener('scroll', handleScroll);
          outer.scrollTo({ top: top, behavior: behavior });
          handleScroll(); // call once in case no scroll is applied.
        }
      });
    },
    [contSize.height, flattened, itemHeight],
  );

  useImperativeHandle(
    ref,
    () => ({
      listRef: listRef.current,
      scrollToItemById: scrollToItemById,
    }),
    [scrollToItemById],
  );

  useLayoutEffect(() => {
    if (measureItemRef.current) {
      const height = measureItemRef.current.offsetHeight;
      setItemHeight(height);
    }
  }, [measureNode?.id]);

  const Outer = useMemo(
    () =>
      forwardRef(function Outer({ children, ...props }: any, fref: ForwardedRef<HTMLDivElement>) {
        return (
          <div
            ref={fref}
            id={id}
            role="virtualized-tree-outer"
            aria-labelledby={labelledBy}
            aria-multiselectable={multiSelect}
            onKeyDown={handleTreeKeyDown}
            onFocus={handleFocus}
            {...props}
          >
            {children}
          </div>
        );
      }),
    [id, labelledBy, multiSelect],
  );

  useEffect(() => {
    if (outerRef.current) {
      outerRef.current.className = className;
    }
  }, [className]);

  const Body = useMemo(
    () =>
      forwardRef(function Body({ children, ...props }: any, ref: ForwardedRef<HTMLUListElement>) {
        return (
          <ul ref={ref} role="tree" {...props}>
            {children}
            <li ref={hiderRef} role="animation-hider" />
          </ul>
        );
      }),
    [],
  );

  //const onItemsRendered = useRef((props: ListOnItemsRenderedProps) => {
  //  listRenderIndexes.current = props;
  //}).current;

  useEffect(() => {
    let rafID = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (rafID) {
        cancelAnimationFrame(rafID);
      }
      rafID = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        contHeightRef.current = height;
        setContSize({ width, height });
      });
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => {
      observer.disconnect();
      if (rafID) {
        cancelAnimationFrame(rafID);
      }
    };
  }, []);

  useEffect(() => {
    const newListHeight = flattened.length * itemHeight;
    if (listHeight > newListHeight) {
      const timeout = setTimeout(() => {
        setListHeight(newListHeight);
        // wait until the collapse animation ends.
      }, 200);
      return () => clearTimeout(timeout);
    }
    // apply inmediatly on expand animation.
    setListHeight(newListHeight);
  }, [flattened.length, itemHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const height = Math.min(contSize.height, listHeight);

  return (
    <div ref={containerRef} className="virtualized-tree" tabIndex={-1}>
      <div
        ref={measureItemRef}
        role="tree-measure-item"
        style={{ position: 'absolute', visibility: 'hidden' }}
      >
        {measureNode && <VirtualizedTreeRow index={0} style={{}} data={[measureNode]} />}
      </div>
      <FixedSizeList
        ref={listRef}
        layout="vertical"
        height={height}
        width={'100%'}
        itemData={flattened}
        itemCount={flattened.length}
        itemKey={itemKey}
        itemSize={itemHeight}
        overscanCount={10}
        //onItemsRendered={onItemsRendered}
        outerElementType={Outer}
        outerRef={outerRef}
        innerElementType={Body}
        innerRef={bodyRef}
        children={VirtualizedTreeRow}
      />
      {footer}
    </div>
  );
});
export const VirtualizedTree = React.memo(VirtualizedTreeComponent);
