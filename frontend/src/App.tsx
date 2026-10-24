import { BrowserRouter, Route, Routes } from 'react-router'
import { AllFoundBanner } from './components/AllFoundBanner'
import { TopBar } from './components/TopBar/TopBar'
import { StoreProvider } from './store'
import { Operator } from './views/Operator/Operator'
import { SimSetup } from './views/SimSetup/SimSetup'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <div className="flex h-full flex-col">
          <TopBar />
          <Routes>
            <Route path="/" element={<Operator />} />
            <Route path="/setup" element={<SimSetup />} />
          </Routes>
          <AllFoundBanner />
        </div>
      </BrowserRouter>
    </StoreProvider>
  )
}
