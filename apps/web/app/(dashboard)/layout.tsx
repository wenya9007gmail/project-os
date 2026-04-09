'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FolderOpen, Radio, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/projects', label: '项目库', icon: FolderOpen },
  { href: '/capture', label: '采集队列', icon: Radio },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b">
          <LayoutDashboard className="w-5 h-5 mr-2 text-primary" />
          <span className="font-bold text-sm tracking-wide">Project OS</span>
          <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">v1</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Settings footer */}
        <div className="p-2 border-t">
          <Link
            href="/settings"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            <Settings className="w-4 h-4" />
            设置
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
