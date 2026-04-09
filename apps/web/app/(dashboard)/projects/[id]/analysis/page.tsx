import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { AnalysisPanel } from '@/components/AnalysisPanel'
import type { Project, ProjectAnalysis, ProjectHandoff } from '@/lib/types'

type Params = { params: { id: string } }

async function getData(id: string) {
  const db = createServerClient()
  const [{ data: project }, { data: analysis }, { data: handoffs }] = await Promise.all([
    db.from('projects').select('*').eq('id', id).single(),
    db.from('project_analysis').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(1).single(),
    db.from('project_handoffs').select('*').eq('project_id', id).order('version', { ascending: false }),
  ])
  if (!project) notFound()

  // Dedupe handoffs by type (latest version only)
  const handoffMap = new Map<string, ProjectHandoff>()
  for (const h of (handoffs ?? []) as ProjectHandoff[]) {
    if (!handoffMap.has(h.handoff_type)) handoffMap.set(h.handoff_type, h)
  }

  return {
    project: project as Project,
    analysis: (analysis as ProjectAnalysis) ?? null,
    handoffs: Array.from(handoffMap.values()),
  }
}

export default async function AnalysisPage({ params }: Params) {
  const { project, analysis, handoffs } = await getData(params.id)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/projects/${params.id}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">分析报告</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      <AnalysisPanel
        projectId={project.id}
        initialAnalysis={analysis}
        initialHandoffs={handoffs}
      />
    </div>
  )
}
