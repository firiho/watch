'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface ActiveItem {
  id: number;
  type: 'movie' | 'tv';
}

interface ModalContextType {
  activeItem: ActiveItem | null;
  openModal: (id: number, type: 'movie' | 'tv') => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

/**
 * Which title the detail modal shows. The modal itself owns presentation —
 * enter/exit animations and the body scroll lock (via useBodyScrollLock) — so
 * closing here simply clears the item and the sheet animates out on its own.
 */
export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);

  const openModal = useCallback((id: number, type: 'movie' | 'tv') => {
    setActiveItem({ id, type });
  }, []);

  const closeModal = useCallback(() => {
    setActiveItem(null);
  }, []);

  // Stable value: cards consuming the context don't re-render when a parent does.
  const value = useMemo(() => ({ activeItem, openModal, closeModal }), [activeItem, openModal, closeModal]);

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
