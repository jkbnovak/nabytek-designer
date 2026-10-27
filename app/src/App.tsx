import { useEffect, useState } from 'react'
import { ProjectDialog } from './ProjectDialog'
import { ProjectsDialog } from './ProjectsDialog'
import { Workspace } from './Workspace'
import { loznice } from './model/samples/loznice'
import type { Assembly } from './model/schema'
import {
  createProject,
  deleteProjectData,
  EMPTY_ASSEMBLY,
  downloadText,
  exportProject,
  loadCurrent,
  loadIndex,
  parseProjectFile,
  saveCurrent,
  saveIndex,
  type ProjectMeta,
} from './projects'

/** Výchozí stav: seznam projektů a otevřený projekt (první spuštění = vzorová ložnice). */
function initialProjects(): { list: ProjectMeta[]; current: string } {
  let list = loadIndex()
  if (!list.length) {
    list = [createProject(loznice)]
    saveIndex(list)
  }
  const saved = loadCurrent()
  return { list, current: list.some((p) => p.id === saved) ? saved! : list[0].id }
}

export default function App() {
  const [{ list, current }, setState] = useState(initialProjects)
  const [dialog, setDialog] = useState<'projects' | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => saveIndex(list), [list])
  useEffect(() => {
    saveCurrent(current)
  }, [current])
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(id)
  }, [error])

  const patchMeta = (id: string, p: Partial<ProjectMeta>) =>
    setState((s) => ({ ...s, list: s.list.map((m) => (m.id === id ? { ...m, ...p } : m)) }))

  const add = (assembly: Assembly, sketches?: Parameters<typeof createProject>[1], advisor?: unknown[]) => {
    const meta = createProject(assembly, sketches, advisor)
    setState((s) => ({ list: [...s.list, meta], current: meta.id }))
    setDialog(null)
  }

  const remove = (id: string) => {
    deleteProjectData(id)
    const rest = list.filter((m) => m.id !== id)
    if (current !== id) return setState({ list: rest, current })
    // smazaný byl otevřený – otevřít jiný, případně založit prázdný
    if (rest.length) return setState({ list: rest, current: rest[0].id })
    const meta = createProject(EMPTY_ASSEMBLY)
    setState({ list: [meta], current: meta.id })
  }

  return (
    <>
      <Workspace
        key={current}
        projectId={current}
        onRename={(name) => patchMeta(current, { name })}
        onTouched={() => patchMeta(current, { updated: Date.now() })}
        onProjects={() => setDialog('projects')}
        onNew={() => setDialog('new')}
      />
      {dialog === 'projects' && (
        <ProjectsDialog
          projects={list}
          currentId={current}
          onOpen={(id) => {
            setState((s) => ({ ...s, current: id }))
            setDialog(null)
          }}
          onDelete={remove}
          onExport={(id) => {
            try {
              const { filename, content } = exportProject(id)
              downloadText(filename, content)
            } catch {
              setError('Projekt se nepodařilo uložit do souboru.')
            }
          }}
          onImport={(text) => {
            try {
              const { assembly, sketches, advisor } = parseProjectFile(text)
              add(assembly, sketches, advisor)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
          onNew={() => setDialog('new')}
          onSample={() => add(loznice)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'new' && (
        <ProjectDialog
          title="Nový projekt"
          name="Nový projekt"
          brief=""
          okLabel="Založit"
          onOk={(p) => add({ ...EMPTY_ASSEMBLY, ...p })}
          onCancel={() => setDialog(null)}
        />
      )}
      {error && <div className="toast error app-toast">{error}</div>}
    </>
  )
}
