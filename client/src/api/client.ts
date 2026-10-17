import type {
  AssignmentRecord,
  AuthResponse,
  CalendarUpdateInput,
  DependencyCreateInput,
  DependencyUpdateInput,
  HolidayCreateInput,
  MoveTaskInput,
  ProjectSnapshot,
  ResourceCreateInput,
  ResourceRecord,
  ResourceUpdateInput,
  TaskRecord,
  TaskUpdateInput,
  UserRecord,
} from '@gantt/shared';
import type { AnalysisResponse, ProjectListResponse } from './types.js';

const TOKEN_KEY = 'ganttflow.token';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage dapat diblokir; sesi tetap berjalan di memori.
  }
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Tidak dapat terhubung ke server. Periksa koneksi Anda.');
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && options.auth !== false && token) {
      setToken(null);
      window.dispatchEvent(new Event('ganttflow:unauthorized'));
    }
    const body = (payload ?? {}) as ApiErrorBody;
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? 'UNKNOWN_ERROR',
      body.error?.message ?? 'Terjadi kesalahan. Silakan coba lagi.',
      body.error?.details ?? {},
    );
  }

  return payload as T;
}

export const api = {
  auth: {
    register: (input: { name: string; email: string; password: string }) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: input, auth: false }),
    login: (input: { email: string; password: string }) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: input, auth: false }),
    me: () => request<{ user: UserRecord }>('/auth/me'),
  },
  projects: {
    list: () => request<ProjectListResponse>('/projects'),
    get: (id: string) => request<ProjectSnapshot>(`/projects/${id}`),
    create: (input: {
      name: string;
      description?: string | null;
      startDate: string;
      weekendDays?: number[];
    }) => request<ProjectSnapshot>('/projects', { method: 'POST', body: input }),
    update: (id: string, input: { name?: string; description?: string | null; startDate?: string }) =>
      request<ProjectSnapshot>(`/projects/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    create: (
      projectId: string,
      input: {
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
      },
    ) => request<{ tasks: TaskRecord[] }>(`/projects/${projectId}/tasks`, { method: 'POST', body: input }),
    update: (id: string, input: TaskUpdateInput) =>
      request<{ tasks: TaskRecord[] }>(`/tasks/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) =>
      request<{ tasks: TaskRecord[] }>(`/tasks/${id}`, { method: 'DELETE' }),
    move: (id: string, input: MoveTaskInput) =>
      request<{ tasks: TaskRecord[] }>(`/tasks/${id}/move`, { method: 'POST', body: input }),
    addDependency: (id: string, input: DependencyCreateInput) =>
      request<{ tasks: TaskRecord[] }>(`/tasks/${id}/dependencies`, { method: 'POST', body: input }),
    addAssignment: (id: string, input: { resourceId: string; allocationPercent?: number }) =>
      request<{ assignment: AssignmentRecord; tasks: TaskRecord[] }>(`/tasks/${id}/assignments`, {
        method: 'POST',
        body: input,
      }),
  },
  dependencies: {
    update: (id: string, input: DependencyUpdateInput) =>
      request<{ tasks: TaskRecord[] }>(`/dependencies/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) =>
      request<{ tasks: TaskRecord[] }>(`/dependencies/${id}`, { method: 'DELETE' }),
  },
  resources: {
    list: (projectId: string) =>
      request<{ resources: ResourceRecord[] }>(`/projects/${projectId}/resources`),
    create: (projectId: string, input: ResourceCreateInput) =>
      request<{ resource: ResourceRecord }>(`/projects/${projectId}/resources`, {
        method: 'POST',
        body: input,
      }),
    update: (id: string, input: ResourceUpdateInput) =>
      request<{ resource: ResourceRecord }>(`/resources/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) =>
      request<{ tasks: TaskRecord[] }>(`/resources/${id}`, { method: 'DELETE' }),
  },
  assignments: {
    update: (id: string, input: { allocationPercent: number }) =>
      request<{ assignment: AssignmentRecord }>(`/assignments/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    remove: (id: string) => request<void>(`/assignments/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    update: (projectId: string, input: CalendarUpdateInput) =>
      request<{ project: ProjectSnapshot['project']; tasks: TaskRecord[] }>(
        `/projects/${projectId}/calendar`,
        { method: 'PUT', body: input },
      ),
    addHoliday: (projectId: string, input: HolidayCreateInput) =>
      request<{ project: ProjectSnapshot['project']; tasks: TaskRecord[] }>(
        `/projects/${projectId}/holidays`,
        { method: 'POST', body: input },
      ),
    removeHoliday: (id: string) =>
      request<{ project: ProjectSnapshot['project']; tasks: TaskRecord[] }>(`/holidays/${id}`, {
        method: 'DELETE',
      }),
  },
  analysis: {
    get: (projectId: string) => request<AnalysisResponse>(`/projects/${projectId}/analysis`),
  },
};

