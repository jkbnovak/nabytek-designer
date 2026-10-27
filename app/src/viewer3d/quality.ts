import { createContext, useContext } from 'react'

/** Kvalitní render (stíny, bez pomocných hran) vs. rychlý pracovní náhled. */
export const RenderQuality = createContext(false)
export const useRenderQuality = () => useContext(RenderQuality)
