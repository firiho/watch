'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ActiveItem {
  id: number;
  type: 'movie' | 'tv';
}

interface ModalContextType {
  activeItem: ActiveItem | null;
  openModal: (id: number, type: 'movie' | 'tv') => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);

  const openModal = useCallback((id: number, type: 'movie' | 'tv') => {
    setActiveItem({ id, type });
    // Prevent scrolling on body when modal is open
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setActiveItem(null);
    document.body.style.overflow = 'unset';
  }, []);

  return (
    <ModalContext.Provider value={{ activeItem, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
