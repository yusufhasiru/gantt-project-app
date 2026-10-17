import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DependencyCreateInput,
  DependencyUpdateInput,
  HolidayCreateInput,
  MoveTaskInput,
  ProjectSnapshot,
  ResourceCreateInput,
  ResourceUpdateInput,
  TaskRecord,
  TaskUpdateInput,
} from '@gantt/shared';
import { api } from '../api/client.js';
import { queryKeys } from '../lib/queryClient.js';
import type { AnalysisResponse, ProjectListResponse } from '../api/types.js';

export function useProjects() {
  return useQuery<ProjectListResponse>({
    queryKey: queryKeys.projects,
    queryFn: () => api.projects.list(),
  });
}

export function useProject(projectId: string) {
  return useQuery<ProjectSnapshot>({
    queryKey: queryKeys.project(projectId),
    queryFn: () => api.projects.get(projectId),
    enabled: Boolean(projectId),
  });
}

export function useAnalysis(projectId: string) {
  return useQuery<AnalysisResponse>({
    queryKey: queryKeys.analysis(projectId),
    queryFn: () => api.analysis.get(projectId),
    enabled: Boolean(projectId),
  });
}

function useProjectInvalidation(projectId?: string) {
  const queryClient = useQueryClient();

  return (tasks?: TaskRecord[], project?: ProjectSnapshot['project']) => {
    if (projectId) {
      if (tasks) {
        queryClient.setQueryData<ProjectSnapshot>(queryKeys.project(projectId), (previous) =>
          previous ? { ...previous, tasks } : previous,
        );
      }
      if (project) {
        queryClient.setQueryData<ProjectSnapshot>(queryKeys.project(projectId), (previous) =>
          previous ? { ...previous, project } : previous,
        );
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysis(projectId) });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
  };
}

export interface TaskInput {
  name: string;
  description?: string | null;
  parentId?: string | null;
  durationDays: number;
  startDate: string;
  priority?: string;
  color?: string;
  progress?: number;
  optimisticDays?: number | null;
  pessimisticDays?: number | null;
}

export function useProjectMutations(projectId: string) {
  const invalidate = useProjectInvalidation(projectId);

  const createTask = useMutation({
    mutationFn: (input: TaskInput) => api.tasks.create(projectId, input),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdateInput }) =>
      api.tasks.update(id, input),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const moveTask = useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveTaskInput }) =>
      api.tasks.move(id, input),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const addDependency = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DependencyCreateInput }) =>
      api.tasks.addDependency(id, input),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const updateDependency = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DependencyUpdateInput }) =>
      api.dependencies.update(id, input),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const deleteDependency = useMutation({
    mutationFn: (id: string) => api.dependencies.remove(id),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const addAssignment = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { resourceId: string; allocationPercent: number } }) =>
      api.tasks.addAssignment(id, input),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, allocationPercent }: { id: string; allocationPercent: number }) =>
      api.assignments.update(id, { allocationPercent }),
    onSuccess: () => invalidate(),
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: string) => api.assignments.remove(id),
    onSuccess: () => invalidate(),
  });

  const createResource = useMutation({
    mutationFn: (input: ResourceCreateInput) => api.resources.create(projectId, input),
    onSuccess: () => invalidate(),
  });

  const updateResource = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResourceUpdateInput }) =>
      api.resources.update(id, input),
    onSuccess: () => invalidate(),
  });

  const deleteResource = useMutation({
    mutationFn: (id: string) => api.resources.remove(id),
    onSuccess: (data) => invalidate(data.tasks),
  });

  const updateCalendar = useMutation({
    mutationFn: (weekendDays: number[]) => api.calendar.update(projectId, { weekendDays }),
    onSuccess: (data) => invalidate(data.tasks, data.project),
  });

  const addHoliday = useMutation({
    mutationFn: (input: HolidayCreateInput) => api.calendar.addHoliday(projectId, input),
    onSuccess: (data) => invalidate(data.tasks, data.project),
  });

  const removeHoliday = useMutation({
    mutationFn: (id: string) => api.calendar.removeHoliday(id),
    onSuccess: (data) => invalidate(data.tasks, data.project ?? undefined),
  });

  return {
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    addDependency,
    updateDependency,
    deleteDependency,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    createResource,
    updateResource,
    deleteResource,
    updateCalendar,
    addHoliday,
    removeHoliday,
  };
}

export function useProjectActions() {
  const queryClient = useQueryClient();

  const createProject = useMutation({
    mutationFn: (input: { name: string; description?: string | null; startDate: string; weekendDays?: number[] }) =>
      api.projects.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  const updateProject = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string | null; startDate?: string } }) =>
      api.projects.update(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.project(data.project.id), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysis(data.project.id) });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  return { createProject, updateProject, deleteProject };
}
