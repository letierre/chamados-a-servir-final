'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './components/Sidebar'

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  return (
    <div className="flex min-h-screen">
      {!isLoginPage && <Sidebar />}

      <main
        className={`flex-1 h-screen overflow-y-auto ${
          isLoginPage ? 'bg-[#f3f4f6]' : 'bg-gray-50/50'
        }`}
      >
        <div className={`${isLoginPage ? '' : 'p-8 max-w-7xl mx-auto'}`}>
          {children}
        </div>
      </main>
    </div>
  )
}
