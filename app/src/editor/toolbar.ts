import { createContext } from 'react'

/** Kam se vykreslují lišty nástrojů: null = na své místo, jinak do plovoucího panelu (celá obrazovka). */
export const ToolbarTarget = createContext<HTMLElement | null>(null)
