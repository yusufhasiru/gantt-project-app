import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TaskRecord } from '@gantt/shared';
import { useProject, useProjectMutations } from '../hooks/useProjectData.js';
import { useLocalStorageState } from '../lib/useLocalStorageState.js';
import { GanttChart } from '../components/gantt/GanttChart.js';
import { TaskFormDialog } from '../components/tasks/TaskFormDialog.js';
import { DependencyDialog } from '../components/tasks/DependencyDialog.js';
import { AssignmentDialog } from '../components/tasks/AssignmentDialog.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { ErrorState, PageLoader } from '../components/ui/States.js';
import { Badge } from '../components/ui/States.js';
import { useToast } from '../components/ui/Toast.js';

export function GanttPage() {
  const { id = '' } = useParams();
  const query = useProject(id);
  const { updateTask, deleteTask } = useProjectMutations(id);
  const { showToast } = useToast();
  const [showCritical, setShowCritical] = useLocalStorageState('ganttflow.showCritical', false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [dependencyTask, setDependencyTask] = useState<TaskRecord | null>(null);
  const [assignmentTask, setAssignmentTask] = useState<TaskRecord | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskRecord | null>(null);

  if (query.isLoading) return <PageLoader label="Memuat Gantt Chart..." />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat proyek.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { project, tasks, dependencies, resources, assignments } = query.data;
  const calendar = { weekendDays: project.weekendDays, holidays: project.holidays.map((holiday) => holiday.date) };

  const handleScheduleChange = async (taskId: string, change: { startDate?: string; durationDays?: number }) => {
    try {
      const response = await updateTask.mutateAsync({ id: taskId, input: change });
      const updated = response.tasks.find((task) => task.id === taskId);
      if (!updated) return;
      const corrected =
        (change.startDate && updated.scheduledStart !== change.startDate) ||
        (change.durationDays && updated.durationDays !== change.durationDays);
      if (corrected) {
        showToast(
          'Jadwal disesuaikan dengan dependensi dan kalender kerja. Tanggal akhir mengikuti mesin penjadwalan.',
          'info',
        );
      } else {
        showToast('Jadwal tugas diperbarui.');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gagal memperbarui jadwal.', 'error');
    }
  };

  const openCreate = (parentId: string | null = null) => {
    setEditingTask(null);
    setDefaultParentId(parentId);
    setFormOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="brand">{tasks.length} tugas</Badge>
        <Badge tone="neutral">{dependencies.length} dependensi</Badge>
        <Badge tone="neutral">{resources.length} anggota</Badge>
        <span className="ml-1 hidden sm:inline">
          Tarik bar untuk mengubah tanggal mulai, atau tarik ujung kanan bar untuk durasi. Tugas induk
          tidak dapat diubah langsung.
        </span>
      </div>

      <GanttChart
        project={project}
        tasks={tasks}
        dependencies={dependencies}
        resources={resources}
        assignments={assignments}
        calendar={calendar}
        showCritical={showCritical}
        onToggleCritical={() => setShowCritical(!showCritical)}
        onAddTask={() => openCreate(null)}
        onEditTask={(task) => {
          setEditingTask(task);
          setDefaultParentId(null);
          setFormOpen(true);
        }}
        onManageDependencies={setDependencyTask}
        onManageAssignments={setAssignmentTask}
        onDeleteTask={setDeletingTask}
        onScheduleChange={handleScheduleChange}
      />

      <TaskFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
          setDefaultParentId(null);
        }}
        projectId={project.id}
        projectStart={project.startDate}
        tasks={tasks}
        task={editingTask}
        defaultParentId={defaultParentId}
      />

      {dependencyTask ? (
        <DependencyDialog
          open={Boolean(dependencyTask)}
          onClose={() => setDependencyTask(null)}
          projectId={project.id}
          task={dependencyTask}
          tasks={tasks}
          dependencies={dependencies}
        />
      ) : null}

      {assignmentTask ? (
        <AssignmentDialog
          open={Boolean(assignmentTask)}
          onClose={() => setAssignmentTask(null)}
          projectId={project.id}
          task={assignmentTask}
          resources={resources}
          assignments={assignments}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingTask)}
        title="Hapus tugas?"
        message={`Tugas "${deletingTask?.name ?? ''}" akan dihapus. Sub-tugas, dependensi, dan alokasi yang terkait juga akan dihapus, lalu jadwal dihitung ulang.`}
        confirmLabel="Hapus tugas"
        onCancel={() => setDeletingTask(null)}
        onConfirm={async () => {
          if (!deletingTask) return;
          try {
            await deleteTask.mutateAsync(deletingTask.id);
            showToast('Tugas berhasil dihapus.');
            setDeletingTask(null);
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Gagal menghapus tugas.', 'error');
          }
        }}
      />
    </div>
  );
}
