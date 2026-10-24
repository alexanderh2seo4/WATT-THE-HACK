// One store for both views: static data (fetched once) + the latest /state snapshot.
import { createContext, useContext, type ReactNode } from 'react'
import { usePolling, useStatic, type State, type Static } from './api'

interface Store {
  staticData: Static | null
  state: State | null
}

const StoreContext = createContext<Store>({ staticData: null, state: null })

export function StoreProvider({ children }: { children: ReactNode }) {
  const staticData = useStatic()
  const { state, error } = usePolling(500)
  return (
    <StoreContext.Provider value={{ staticData, state }}>
      {children}
      {(!state || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100/95 p-6">
          <div role="status" aria-live="polite" className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
            <h1 className="mb-3 text-xl font-semibold text-brand">
              {error ? 'Private session unavailable' : 'Starting your private session'}
            </h1>
            <p className="text-sm text-slate-600">{error ?? 'Preparing a separate Python instance just for you…'}</p>
            <p className="mt-3 text-xs text-slate-400">
              {error ? 'We retry automatically every 5 seconds.' : 'Up to 8 visitors can run their own simulation.'}
            </p>
            {error && (
              <button onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm text-white">
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </StoreContext.Provider>
  )
}

export const useStore = () => useContext(StoreContext)
