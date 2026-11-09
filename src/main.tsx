import { createRoot } from 'react-dom/client'
import { StudioRoot } from './studio/StudioApp'
import './custom-element'
createRoot(document.getElementById('root')!).render(<StudioRoot />)
