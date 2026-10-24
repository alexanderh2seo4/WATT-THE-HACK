import { BrowserRouter, HashRouter, Route, Routes } from 'react-router'
import { AllFoundBanner } from './components/AllFoundBanner'
import { TopBar } from './components/TopBar/TopBar'
import { StoreProvider } from './store'
import { Operator } from './views/Operator/Operator'
import { SimSetup } from './views/SimSetup/SimSetup'

// Pages has no SPA rewrites; hash routes also work when refreshing the Simulation view.
const Router = import.meta.env.BASE_URL === '/' ? BrowserRouter : HashRouter

export default function App() {
  return (
    <StoreProvider>
      <Router>
        <div className="flex h-full flex-col">
          <TopBar />
          <Routes>
            <Route path="/" element={<Operator />} />
            <Route path="/setup" element={<SimSetup />} />
          </Routes>
          <AllFoundBanner />
        </div>
      </Router>
    </StoreProvider>
  )
}
