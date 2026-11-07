import React, { lazy, Suspense, useEffect, useState } from 'react'

const SubtitleOverlay = lazy(() => import('./components/SubtitleOverlay'))
const SettingsPanel = lazy(() => import('./components/SettingsPanel'))

function App(): React.JSX.Element {
  const [isSubtitleMode, setIsSubtitleMode] = useState(() => window.location.hash === '#/subtitle')

  useEffect(() => {
    // Hash routing: #/subtitle for subtitle overlay window
    const handleHashChange = (): void => {
      setIsSubtitleMode(window.location.hash === '#/subtitle')
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return <Suspense fallback={null}>{isSubtitleMode ? <SubtitleOverlay /> : <SettingsPanel />}</Suspense>
}

export default App
