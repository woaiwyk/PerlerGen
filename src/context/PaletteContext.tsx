import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Palette, BeadColor } from '../types';
import { AVAILABLE_PALETTES } from '../beadPalettes';

interface PaletteContextType {
  allPalettes: Palette[];
  selectedPaletteId: string;
  activePalette: Palette;
  setSelectedPaletteId: (id: string) => void;
  addCustomPalette: (name: string, colors: BeadColor[]) => void;
  removeCustomPalette: (id: string) => void;
}

const PaletteContext = createContext<PaletteContextType | undefined>(undefined);

export const PaletteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Load custom palettes from localStorage on mount
  const [customPalettes, setCustomPalettes] = useState<Palette[]>(() => {
    try {
      const saved = localStorage.getItem('custom_palettes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load custom palettes", e);
      return [];
    }
  });

  const [selectedPaletteId, setSelectedPaletteId] = useState<string>(() => {
     return localStorage.getItem('selected_palette_id') || 'mard_221';
  });

  // Save to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('custom_palettes', JSON.stringify(customPalettes));
  }, [customPalettes]);

  useEffect(() => {
    localStorage.setItem('selected_palette_id', selectedPaletteId);
  }, [selectedPaletteId]);

  const allPalettes = [...AVAILABLE_PALETTES, ...customPalettes];

  const activePalette = allPalettes.find(p => p.id === selectedPaletteId) || allPalettes[0];

  const addCustomPalette = (name: string, colors: BeadColor[]) => {
    const newPalette: Palette = {
      id: `custom_${Date.now()}`,
      name: name,
      colors: colors
    };
    setCustomPalettes(prev => [...prev, newPalette]);
    setSelectedPaletteId(newPalette.id); // Auto select the new one
  };

  const removeCustomPalette = (id: string) => {
    setCustomPalettes(prev => prev.filter(p => p.id !== id));
    if (selectedPaletteId === id) {
      setSelectedPaletteId(AVAILABLE_PALETTES[0].id);
    }
  };

  return (
    <PaletteContext.Provider value={{
      allPalettes,
      selectedPaletteId,
      activePalette,
      setSelectedPaletteId,
      addCustomPalette,
      removeCustomPalette
    }}>
      {children}
    </PaletteContext.Provider>
  );
};

export const usePalette = () => {
  const context = useContext(PaletteContext);
  if (context === undefined) {
    throw new Error('usePalette must be used within a PaletteProvider');
  }
  return context;
};
