import React from 'react'
import ReactDOM from 'react-dom/client'
import SketchER from './SketchER.jsx'

// Remove anonymous reset tags left behind by older hot-reloaded builds.
for (const candidate of document.head.querySelectorAll('style:not([id])')) {
  const css = candidate.textContent || ''
  if (css.includes('body { overflow: hidden; }') && css.includes('box-sizing: border-box')) {
    candidate.remove()
  }
}

const style = document.getElementById('sketcher-global-styles') || document.createElement('style')
style.id = 'sketcher-global-styles'
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap');
  html, body, #root {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
`
if (!style.isConnected) document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SketchER />
  </React.StrictMode>
)
