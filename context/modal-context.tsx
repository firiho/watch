'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';

export interface ActiveItem {
  id: number;
  type: 'movie' | 'tv';
}

export interface ModalActions {
  openModal: (id: number, type: 'movie' | 'tv') => void;
  closeModal: () => void;
  /**
   * Calls `listener` every time a title opens (switching titles included) and returns the
   * unsubscribe function. Lets a component react to an open without re-rendering on every
   * open and close, which reading `activeItem` would cause.
   */
  onModalOpen: (listener: () => void) => () => void;
  /** Whether a title is open right now, read without subscribing to changes. */
  isModalOpen: () => boolean;
}

// Two contexts on purpose: every card and filmography row needs the actions, but only the few
// components that react to the open title should re-render when it changes.
const ModalActionsContext = createContext<ModalActions | null>(null);
const ModalStateContext = createContext<ActiveItem | null>(null);

function createActions(setActiveItem: (item: ActiveItem | null) => void): ModalActions {
  const openListeners = new Set<() => void>();
  let open = false;
  return {
    openModal: (id, type) => {
      open = true;
      setActiveItem({ id, type });
      // Listeners usually set state of their own; React batches it into the commit that opens the modal.
      // Iterate a copy, since a listener may unsubscribe while it runs.
      for (const listener of [...openListeners]) listener();
    },
    closeModal: () => {
      open = false;
      setActiveItem(null);
    },
    onModalOpen: (listener) => {
      openListeners.add(listener);
      return () => {
        openListeners.delete(listener);
      };
    },
    isModalOpen: () => open,
  };
}

/**
 * Which title the detail modal shows. The modal itself owns presentation —
 * enter/exit animations and the body scroll lock (via useBodyScrollLock) — so
 * closing here simply clears the item and the sheet animates out on its own.
 */
export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);
  // Created once, so the actions context never changes and its consumers never re-render through it.
  const [actions] = useState(() => createActions(setActiveItem));

  return (
    <ModalActionsContext.Provider value={actions}>
      <ModalStateContext.Provider value={activeItem}>{children}</ModalStateContext.Provider>
    </ModalActionsContext.Provider>
  );
};

const useActionsContext = (hookName: string): ModalActions => {
  const actions = useContext(ModalActionsContext);
  if (!actions) {
    throw new Error(`${hookName} must be used within a ModalProvider`);
  }
  return actions;
};

/** The modal's actions alone. Never re-renders the caller when a title opens or closes. */
export const useModalActions = () => useActionsContext('useModalActions');

/**
 * The open title plus the actions. Re-renders the caller on every open and close, so use
 * useModalActions when you only need to open or close the modal.
 */
export const useModal = () => {
  const { openModal, closeModal } = useActionsContext('useModal');
  const activeItem = useContext(ModalStateContext);
  return useMemo(() => ({ activeItem, openModal, closeModal }), [activeItem, openModal, closeModal]);
};
