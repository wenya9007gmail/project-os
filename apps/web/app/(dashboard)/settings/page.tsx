'use client'
import { useState } from 'react'
import { CheckCircle, Key, Server, Globe, Brain } from 'lucide-react'

interface ConfigItem {
  label: string
  key: string
  placeholder: string
  description: string
  icon: React.ElementType
}

const CONFIG_ITEMS: ConfigItem[] = [
  {
    label: 'DeepSeek API Key',
    key: 'DEEPSEEK_API_KEY',
    placeholder: 'sk-xxxx',
    description: '用于项目分析和任务生成',
    icon: Brain,
  },
  {
    label: 'Tavily API Key',
    key: 'TAVILY_API_KEY',
    placeholder: 'tvly-xxxx',
    description: '用于补充研究（Gap Fill）',
    icon: Globe,
  },
  {
    label: 'Supabase URL',
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    placeholder: 'https://xxx.supabase.co',
    description: '数据库地址',
    icon: Server,
  },
  {
    label: 'Supabase Anon Key',
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    placeholder: 'eyJhbGci...',
    description: '前端匿名访问密钥',
    icon: Key,
  },
]

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          API 密钥等配置保存在 <code className="text-xs bg-muted px-1.5 py-0.5 rounded">apps/web/.env.local</code> 中，修改后需要重启服务。
        </p>
      </div>

      {/* Status cards */}
      <div className="space-y-3 mb-8">
        {CONFIG_ITEMS.map(({ label, key, placeholder, description, icon: Icon }) => (
          <div key={key} className="border rounded-xl p-4 bg-card flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{label}</p>
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              <code className="text-xs text-muted-foreground/60 mt-1 block">{key}</code>
            </div>
          </div>
        ))}
      </div>

      {/* Services status */}
      <div className="border rounded-xl p-4 bg-card mb-6">
        <h2 className="text-sm font-semibold mb-3">服务状态</h2>
        <div className="space-y-2">
          {[
            { name: 'Project OS Web', url: 'http://localhost:3002', desc: 'Next.js 主应用' },
            { name: '本地代理服务', url: 'http://localhost:3001', desc: 'Express 本地代理 (Chrome 插件用)' },
            { name: 'Ollama', url: 'http://localhost:11434', desc: '本地嵌入模型 (nomic-embed-text)' },
          ].map(svc => (
            <ServiceRow key={svc.name} {...svc} />
          ))}
        </div>
      </div>

      {/* Chrome extension tip */}
      <div className="border rounded-xl p-4 bg-muted/30">
        <h2 className="text-sm font-semibold mb-1">Chrome 插件</h2>
        <p className="text-xs text-muted-foreground">
          插件目录：<code className="bg-muted px-1 py-0.5 rounded">~/Desktop/project-os/packages/chrome-extension</code>
          <br />
          在 <code className="bg-muted px-1 py-0.5 rounded">chrome://extensions</code> 中「加载已解压的扩展程序」并选择上述目录。
        </p>
      </div>
    </div>
  )
}

function ServiceRow({ name, url, desc }: { name: string; url: string; desc: string }) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useState(() => {
    fetch(url + '/health', { signal: AbortSignal.timeout(2000) })
      .then(r => setStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
  })

  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full shrink-0 ${
        status === 'checking' ? 'bg-yellow-400 animate-pulse' :
        status === 'online' ? 'bg-green-500' : 'bg-red-400'
      }`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">{name}</span>
        <span className="text-xs text-muted-foreground ml-2">{desc}</span>
      </div>
      <code className="text-xs text-muted-foreground/60">{url}</code>
    </div>
  )
}
