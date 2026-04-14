// C:/Users/prati/Desktop/project/Data-Analyst-Frontend/src/main.jsx
window.global = window; 
window.process = { env: { NODE_ENV: 'development' } }; // Add this line

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)