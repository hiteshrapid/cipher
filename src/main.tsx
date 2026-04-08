import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// OBS overlay mode: make page background transparent
if (new URLSearchParams(window.location.search).has('overlay')) {
  document.documentElement.classList.add('overlay-mode')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
