import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  addDays,
  computeCpm,
  diffInCalendarDays,
  flattenTasks,
  formatDateID,
  isWorkingDay,
  nextWorkingDay,
  previewSchedule,
  todayISODate,
  workingDaysBetween,
  type AssignmentRecord,
  type CalendarConfig,
  type DependencyRecord,
  type ProjectRecord,
  type ScheduledValues,
  type TaskRecord,
} from '@gantt/shared';
import { cn, formatPercent } from '../../lib/format.js';
import { useLocalStorageState } from '../../lib/useLocalStorageState.js';
import { Button } from '../ui/Button.js';
import { EmptyState } from '../ui/States.js';

export type ZoomLevel = 'day' | 'week' | 'month';

const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; label: string }> = {
  day: { dayWidth: 36, label: 'Harian' },
  week: { dayWidth: 12, label: 'Mingguan' },
  month: { dayWidth: 4, label: 'Bulanan' },
};

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 64;
const SUMMARY_BAR_Y = 16;

interface DragState {
  taskId: string;
  mode: 'move' | 'resize';
  startClientX: number;
  originalStart: string;
  originalDuration: number;
  pointerId: number;
  appliedDelta: number;
}

interface ScheduleChange {
  startDate?: string;
  durationDays?: number;
}

interface GanttChartProps {
  project: ProjectRecord;
  tasks: TaskRecord[];
  dependencies: DependencyRecord[];
  resources: ResourceRecordLike[];
  assignments: AssignmentRecord[];
  calendar: CalendarConfig;
  showCritical: boolean;
  onToggleCritical: () => void;
  onAddTask: () => void;
  onEditTask: (task: TaskRecord) => void;
  onManageDependencies: (task: TaskRecord) => void;
  onManageAssignments: (task: TaskRecord) => void;
  onDeleteTask: (task: TaskRecord) => void;
  onScheduleChange: (taskId: string, change: ScheduleChange) => Promise<void>;
}

interface ResourceRecordLike {
  id: string;
  name: string;
}

interface HeaderGroup {
  key: string;
  label: string;
  startIndex: number;
  span: number;
}

const MONTH_SHORT = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
const WEEKDAY_SHORT = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' });

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function buildDays(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 3000) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

function groupByMonth(days: string[]): HeaderGroup[] {
  const groups: HeaderGroup[] = [];
  days.forEach((day, index) => {
    const date = toDate(day);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.span += 1;
    } else {
      groups.push({
        key,
        label: `${MONTH_SHORT.format(date)} ${date.getUTCFullYear()}`,
        startIndex: index,
        span: 1,
      });
    }
  });
  return groups;
}

function groupByYear(days: string[]): HeaderGroup[] {
  const groups: HeaderGroup[] = [];
  days.forEach((day, index) => {
    const year = toDate(day).getUTCFullYear();
    const key = String(year);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.span += 1;
    else groups.push({ key, label: key, startIndex: index, span: 1 });
  });
  return groups;
}

function groupByWeek(days: string[]): HeaderGroup[] {
  const groups: HeaderGroup[] = [];
  days.forEach((day, index) => {
    const date = toDate(day);
    const weekday = date.getUTCDay();
    const monday = addDays(day, -((weekday + 6) % 7));
    const last = groups[groups.length - 1];
    if (last && last.key === monday) last.span += 1;
    else {
      const mondayDate = toDate(monday);
      groups.push({
        key: monday,
        label: `${mondayDate.getUTCDate()} ${MONTH_SHORT.format(mondayDate)}`,
        startIndex: index,
        span: 1,
      });
    }
  });
  return groups;
}

function groupByDay(days: string[]): HeaderGroup[] {
  return days.map((day, index) => {
    const date = toDate(day);
    return {
      key: day,
      label: `${date.getUTCDate()} ${WEEKDAY_SHORT.format(date)}`,
      startIndex: index,
      span: 1,
    };
  });
}

function taskInitials(task: TaskRecord, assignments: AssignmentRecord[], resources: ResourceRecordLike[]) {
  const names = assignments
    .filter((assignment) => assignment.taskId === task.id)
    .map((assignment) => resources.find((resource) => resource.id === assignment.resourceId)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return null;
  return names
    .map((name) =>
      name
        .split(' ')
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join(''),
    )
    .join(', ');
}

export function GanttChart({
  project,
  tasks,
  dependencies,
  resources,
  assignments,
  calendar,
  showCritical,
  onToggleCritical,
  onAddTask,
  onEditTask,
  onManageDependencies,
  onManageAssignments,
  onDeleteTask,
  onScheduleChange,
}: GanttChartProps) {
  const [zoom, setZoom] = useLocalStorageState<ZoomLevel>('ganttflow.ganttZoom', 'day');
  const [collapsedArray, setCollapsedArray] = useLocalStorageState<string[]>('ganttflow.collapsed', []);
  const [showTable, setShowTable] = useState(true);
  const [preview, setPreview] = useState<Record<string, ScheduledValues> | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingChange = useRef<ScheduleChange | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const today = todayISODate();
  const collapsedIds = useMemo(() => new Set(collapsedArray), [collapsedArray]);
  const dayWidth = ZOOM_CONFIG[zoom].dayWidth;
  const calendarKey = `${calendar.weekendDays.join(',')}|${calendar.holidays.join(',')}`;

  const flat = useMemo(() => flattenTasks(tasks, collapsedIds), [tasks, collapsedIds]);

  const leafIds = useMemo(() => {
    const parentIds = new Set(tasks.map((task) => task.parentId).filter(Boolean));
    return tasks.filter((task) => !parentIds.has(task.id)).map((task) => task.id);
  }, [tasks]);
  const leafSet = useMemo(() => new Set(leafIds), [leafIds]);

  const criticalIds = useMemo(() => {
    if (!showCritical) return new Set<string>();
    const leafTasks = tasks.filter((task) => leafSet.has(task.id));
    if (leafTasks.length === 0) return new Set<string>();
    try {
      const result = computeCpm(
        leafTasks.map((task) => ({
          id: task.id,
          name: task.name,
          durationDays: task.durationDays,
          scheduledStart: task.scheduledStart,
          scheduledEnd: task.scheduledEnd,
        })),
        dependencies,
        project.startDate,
        calendar,
      );
      return new Set(result.criticalIds);
    } catch {
      return new Set<string>();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCritical, tasks, dependencies, project.startDate, calendarKey]);

  const displayTasks = useMemo(() => {
    if (!preview) return tasks;
    return tasks.map((task) => {
      const next = preview[task.id];
      return next ? { ...task, ...next } : task;
    });
  }, [tasks, preview]);

  const displayFlat = useMemo(
    () => flattenTasks(displayTasks, collapsedIds),
    [displayTasks, collapsedIds],
  );

  const range = useMemo(() => {
    const starts = displayTasks.map((task) => task.scheduledStart);
    const ends = displayTasks.map((task) => task.scheduledEnd);
    const earliest = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : project.startDate;
    const latest = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : addDays(project.startDate, 30);
    const padBefore = zoom === 'month' ? 7 : 3;
    const padAfter = zoom === 'month' ? 21 : 7;
    return {
      start: addDays(earliest < project.startDate ? earliest : project.startDate, -padBefore),
      end: addDays(latest, padAfter),
    };
  }, [displayTasks, project.startDate, zoom]);

  const days = useMemo(() => buildDays(range.start, range.end), [range.start, range.end]);
  const totalDays = days.length;
  const timelineWidth = Math.max(totalDays * dayWidth, 640);
  const svgHeight = Math.max(displayFlat.length * ROW_HEIGHT, 120);

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    displayFlat.forEach((entry, index) => map.set(entry.task.id, index));
    return map;
  }, [displayFlat]);

  const scrollToToday = useCallback(() => {
    const container = timelineRef.current;
    if (!container) return;
    const offset = diffInCalendarDays(range.start, today) * dayWidth;
    container.scrollTo({
      left: Math.max(0, offset - container.clientWidth / 3),
      behavior: 'smooth',
    });
  }, [dayWidth, range.start, today]);

  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    const onScroll = () => {
      if (headerRef.current) headerRef.current.scrollLeft = container.scrollLeft;
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const toggleCollapse = (id: string) => {
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsedArray([...next]);
  };

  const startDrag = (
    event: ReactPointerEvent<SVGGElement | SVGRectElement>,
    task: TaskRecord,
    mode: 'move' | 'resize',
  ) => {
    if (!leafSet.has(task.id)) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      taskId: task.id,
      mode,
      startClientX: event.clientX,
      originalStart: task.scheduledStart,
      originalDuration: task.durationDays,
      pointerId: event.pointerId,
      appliedDelta: 0,
    };
    pendingChange.current = null;
    setDragTaskId(task.id);
  };

  const computePreview = useCallback(
    (drag: DragState, deltaDays: number) => {
      if (drag.mode === 'move') {
        const snapped = nextWorkingDay(addDays(drag.originalStart, deltaDays), calendar);
        const modified = tasks.map((task) =>
          task.id === drag.taskId ? { ...task, startDate: snapped } : task,
        );
        const next = previewSchedule({
          tasks: modified.map((task) => ({
            id: task.id,
            parentId: task.parentId,
            position: task.position,
            durationDays: task.durationDays,
            startDate: task.startDate,
            progress: task.progress,
          })),
          dependencies,
          calendar,
          projectStart: project.startDate,
        });
        pendingChange.current = { startDate: snapped };
        return next;
      }

      const pointerDate = addDays(drag.originalStart, deltaDays);
      const duration = Math.max(
        1,
        workingDaysBetween(drag.originalStart, pointerDate < drag.originalStart ? drag.originalStart : pointerDate, calendar),
      );
      const modified = tasks.map((task) =>
        task.id === drag.taskId ? { ...task, durationDays: duration } : task,
      );
      const next = previewSchedule({
        tasks: modified.map((task) => ({
          id: task.id,
          parentId: task.parentId,
          position: task.position,
          durationDays: task.durationDays,
          startDate: task.startDate,
          progress: task.progress,
        })),
        dependencies,
        calendar,
        projectStart: project.startDate,
      });
      pendingChange.current = { durationDays: duration };
      return next;
    },
    [calendar, dependencies, project.startDate, tasks],
  );

  const onPointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaDays = Math.round((event.clientX - drag.startClientX) / dayWidth);
    if (deltaDays === drag.appliedDelta) return;
    drag.appliedDelta = deltaDays;
    setPreview(computePreview(drag, deltaDays));
  };

  const finishDrag = async (event: ReactPointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragTaskId(null);
    const change = pendingChange.current;
    pendingChange.current = null;
    if (!drag.appliedDelta || !change) {
      setPreview(null);
      return;
    }
    try {
      await onScheduleChange(drag.taskId, change);
    } finally {
      setPreview(null);
    }
  };

  const cancelDrag = () => {
    dragRef.current = null;
    pendingChange.current = null;
    setDragTaskId(null);
    setPreview(null);
  };

  const todayIndex = diffInCalendarDays(range.start, today);
  const showToday = todayIndex >= 0 && todayIndex < totalDays;

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Belum ada tugas"
        description="Tambahkan tugas pertama untuk mulai menyusun jadwal. Tugas dapat memiliki sub-tugas, dependensi, dan anggota tim."
        action={<Button onClick={onAddTask}>Tambah tugas pertama</Button>}
        icon={
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h9M7 12h9M10 18h9" strokeLinecap="round" />
          </svg>
        }
      />
    );
  }

  const bottomGroups =
    zoom === 'day' ? groupByDay(days) : zoom === 'week' ? groupByWeek(days) : groupByMonth(days);
  const topGroups = zoom === 'month' ? groupByYear(days) : groupByMonth(days);

  return (
    <div className="card-base overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Tingkat zoom timeline">
          {(Object.keys(ZOOM_CONFIG) as ZoomLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              aria-pressed={zoom === level}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                zoom === level ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {ZOOM_CONFIG[level].label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={scrollToToday}>
          Hari ini
        </Button>
        <Button
          size="sm"
          variant={showCritical ? 'primary' : 'secondary'}
          onClick={onToggleCritical}
          aria-pressed={showCritical}
          data-testid="critical-toggle"
        >
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 rounded-full', showCritical ? 'bg-white' : 'bg-rose-500')}
          />
          Jalur kritis
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="md:hidden"
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? 'Sembunyikan tabel' : 'Tampilkan tabel'}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={onAddTask}>
            + Tugas
          </Button>
        </div>
      </div>

      <div className="flex border-b border-slate-200 bg-slate-50/80">
        <div
          className={cn(
            'shrink-0 border-r border-slate-200 bg-slate-50/80',
            showTable ? 'w-[300px] md:w-[560px]' : 'hidden md:block md:w-[560px]',
          )}
        >
          <div className="flex h-16 items-end px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <div className="w-10">WBS</div>
            <div className="flex-1">Nama tugas</div>
            <div className="w-12 text-right">Durasi</div>
            <div className="hidden w-[74px] text-right md:block">Mulai</div>
            <div className="hidden w-[74px] text-right md:block">Selesai</div>
            <div className="hidden w-14 text-right md:block">Progres</div>
            <div className="w-[92px] text-right">Aksi</div>
          </div>
        </div>
        <div ref={headerRef} className={cn('flex-1 overflow-hidden', !showTable && 'md:flex-1')}>
          <div className="relative h-16" style={{ width: timelineWidth }}>
            {topGroups.map((group) => (
              <div
                key={group.key}
                className="absolute top-0 flex h-7 items-center border-b border-l border-slate-200 px-2 text-[11px] font-medium text-slate-500"
                style={{ left: group.startIndex * dayWidth, width: group.span * dayWidth }}
              >
                <span className="truncate">{group.label}</span>
              </div>
            ))}
            {bottomGroups.map((group) => (
              <div
                key={group.key}
                className="absolute bottom-0 flex h-9 items-center justify-center overflow-hidden border-l border-slate-200 text-[10px] text-slate-500"
                style={{ left: group.startIndex * dayWidth, width: group.span * dayWidth }}
                title={group.label}
              >
                <span className="truncate px-0.5">{group.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex max-h-[calc(100vh-19rem)] min-h-[300px] overflow-y-auto">
        <div
          className={cn(
            'shrink-0 border-r border-slate-200 bg-white',
            showTable ? 'w-[300px] md:w-[560px]' : 'hidden md:block md:w-[560px]',
          )}
        >
          {displayFlat.map(({ task, depth, wbs, isSummary }, index) => {
            const isCritical = criticalIds.has(task.id);
            const assigneeText = taskInitials(task, assignments, resources);
            return (
              <div
                key={task.id}
                data-testid={`gantt-row-${task.id}`}
                className={cn(
                  'flex h-10 items-center border-b border-slate-100 px-3 text-xs',
                  index % 2 === 1 && 'bg-slate-50/50',
                  dragTaskId === task.id && 'bg-brand-50',
                )}
              >
                <div className="w-10 shrink-0 font-mono text-[11px] text-slate-400">{wbs}</div>
                <div className="flex min-w-0 flex-1 items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
                  {isSummary ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(task.id)}
                      aria-label={collapsedIds.has(task.id) ? `Buka ${task.name}` : `Tutup ${task.name}`}
                      aria-expanded={!collapsedIds.has(task.id)}
                      data-testid={`collapse-${task.id}`}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className={cn('h-2.5 w-2.5 transition-transform', !collapsedIds.has(task.id) && 'rotate-90')}
                        fill="currentColor"
                      >
                        <path d="M4 2l4 4-4 4z" />
                      </svg>
                    </button>
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: task.color }}
                  />
                  <button
                    type="button"
                    onClick={() => onEditTask(task)}
                    className={cn(
                      'truncate text-left',
                      isSummary ? 'font-semibold text-slate-800' : 'text-slate-700',
                      showCritical && isCritical && 'font-semibold text-rose-600',
                    )}
                    title={task.name}
                  >
                    {task.name}
                  </button>
                  {assigneeText ? (
                    <span className="ml-auto hidden shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500 lg:inline">
                      {assigneeText}
                    </span>
                  ) : null}
                </div>
                <div className="w-12 shrink-0 text-right tabular-nums text-slate-500">
                  {task.durationDays}h
                </div>
                <div className="hidden w-[74px] shrink-0 text-right tabular-nums text-slate-500 md:block">
                  {formatDateID(task.scheduledStart).replace(/ \d{4}$/, '')}
                </div>
                <div className="hidden w-[74px] shrink-0 text-right tabular-nums text-slate-500 md:block">
                  {formatDateID(task.scheduledEnd).replace(/ \d{4}$/, '')}
                </div>
                <div className="hidden w-14 shrink-0 items-center justify-end gap-1 md:flex">
                  <div className="h-1 w-6 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-[10px] text-slate-500">{formatPercent(task.progress)}</span>
                </div>
                <div className="flex w-[92px] shrink-0 items-center justify-end gap-0.5">
                  <IconButton label={`Edit ${task.name}`} onClick={() => onEditTask(task)}>
                    <path d="M4 14l1-4 7-7 3 3-7 7-4 1z" />
                  </IconButton>
                  {!isSummary ? (
                    <>
                      <IconButton
                        label={`Dependensi ${task.name}`}
                        onClick={() => onManageDependencies(task)}
                      >
                        <path d="M7 9a3 3 0 004 0l2-2a3 3 0 00-4-4l-1 1M9 7a3 3 0 00-4 0l-2 2a3 3 0 004 4l1-1" />
                      </IconButton>
                      <IconButton
                        label={`Alokasi ${task.name}`}
                        onClick={() => onManageAssignments(task)}
                      >
                        <circle cx="8" cy="6" r="3" />
                        <path d="M2 16c0-3 2.5-5 6-5s6 2 6 5" />
                      </IconButton>
                    </>
                  ) : null}
                  <IconButton label={`Hapus ${task.name}`} onClick={() => onDeleteTask(task)} danger>
                    <path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9" />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={timelineRef}
          className="gantt-scroll flex-1 overflow-x-auto"
          data-testid="gantt-timeline"
        >
          <svg
            width={timelineWidth}
            height={svgHeight}
            role="img"
            aria-label="Timeline Gantt Chart"
            className="block select-none"
          >
            <defs>
              <marker
                id="gantt-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" fill="#94a3b8" />
              </marker>
              <marker
                id="gantt-arrow-critical"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" fill="#e11d48" />
              </marker>
            </defs>

            {days.map((day, index) => {
              const working = isWorkingDay(day, calendar);
              if (working) return null;
              const isHoliday = calendar.holidays.includes(day);
              return (
                <rect
                  key={day}
                  x={index * dayWidth}
                  y={0}
                  width={dayWidth}
                  height={svgHeight}
                  fill={isHoliday ? '#fef3c7' : '#f1f5f9'}
                  opacity={isHoliday ? 0.9 : 0.75}
                />
              );
            })}

            {days.map((day, index) => {
              const showLine =
                zoom === 'day' ||
                (zoom === 'week' && toDate(day).getUTCDay() === 1) ||
                (zoom === 'month' && toDate(day).getUTCDate() === 1);
              if (!showLine) return null;
              return (
                <line
                  key={`line-${day}`}
                  x1={index * dayWidth}
                  x2={index * dayWidth}
                  y1={0}
                  y2={svgHeight}
                  stroke="#e2e8f0"
                  strokeWidth={zoom === 'day' ? 1 : 1}
                />
              );
            })}

            {displayFlat.map(({ task }, index) => (
              <line
                key={`row-${task.id}`}
                x1={0}
                x2={timelineWidth}
                y1={(index + 1) * ROW_HEIGHT}
                y2={(index + 1) * ROW_HEIGHT}
                stroke="#f1f5f9"
              />
            ))}

            {dependencies.map((dependency) => {
              const fromIndex = rowIndex.get(dependency.predecessorId);
              const toIndex = rowIndex.get(dependency.successorId);
              const predecessor = displayTasks.find((task) => task.id === dependency.predecessorId);
              const successor = displayTasks.find((task) => task.id === dependency.successorId);
              if (fromIndex === undefined || toIndex === undefined || !predecessor || !successor) return null;

              const predX = diffInCalendarDays(range.start, predecessor.scheduledStart) * dayWidth;
              const predEndX =
                (diffInCalendarDays(range.start, predecessor.scheduledEnd) + 1) * dayWidth;
              const succX = diffInCalendarDays(range.start, successor.scheduledStart) * dayWidth;
              const x1 = dependency.type === 'FS' ? predEndX : predX;
              const x2 = succX;
              const y1 = fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
              const y2 = toIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
              const isCritical =
                showCritical &&
                criticalIds.has(dependency.predecessorId) &&
                criticalIds.has(dependency.successorId);
              const midY = y1 + (y2 - y1) / 2;
              const laneX = x2 - 12 < x1 + 12 ? x1 + 12 : x2 - 12;
              const path = `M ${x1} ${y1} H ${x1 + 10} V ${midY} H ${laneX} V ${y2} H ${x2 - 4}`;

              return (
                <path
                  key={dependency.id}
                  data-testid={`gantt-arrow-${dependency.id}`}
                  d={path}
                  fill="none"
                  stroke={isCritical ? '#e11d48' : '#94a3b8'}
                  strokeWidth={isCritical ? 2 : 1.4}
                  markerEnd={isCritical ? 'url(#gantt-arrow-critical)' : 'url(#gantt-arrow)'}
                  opacity={0.9}
                />
              );
            })}

            {displayFlat.map(({ task, isSummary }) => {
              const index = rowIndex.get(task.id) ?? 0;
              const x = diffInCalendarDays(range.start, task.scheduledStart) * dayWidth;
              const barWidth = Math.max(
                dayWidth,
                (diffInCalendarDays(task.scheduledStart, task.scheduledEnd) + 1) * dayWidth,
              );
              const y = index * ROW_HEIGHT;
              const isCritical = criticalIds.has(task.id);
              const strokeColor =
                dragTaskId === task.id ? '#312e81' : showCritical && isCritical ? '#e11d48' : task.color;
              const tooltip = `${task.name}\n${formatDateID(task.scheduledStart)} – ${formatDateID(
                task.scheduledEnd,
              )}\nDurasi: ${task.durationDays} hari kerja\nProgres: ${task.progress}%${
                isSummary ? '\nTugas induk (ringkasan)' : ''
              }`;

              if (isSummary) {
                return (
                  <g key={task.id} data-testid={`gantt-summary-${task.id}`}>
                    <title>{tooltip}</title>
                    <path
                      d={`M ${x} ${y + SUMMARY_BAR_Y + 8} h ${barWidth} M ${x} ${y + SUMMARY_BAR_Y + 2} v 12 M ${
                        x + barWidth
                      } ${y + SUMMARY_BAR_Y + 2} v 12`}
                      stroke={strokeColor}
                      strokeWidth={3}
                      strokeLinecap="square"
                    />
                    <rect
                      x={x}
                      y={y + SUMMARY_BAR_Y + 2}
                      width={(barWidth * task.progress) / 100}
                      height={5}
                      fill={strokeColor}
                      opacity={0.55}
                    />
                  </g>
                );
              }

              return (
                <g
                  key={task.id}
                  data-testid={`gantt-bar-${task.id}`}
                  className={leafSet.has(task.id) ? 'cursor-grab active:cursor-grabbing' : ''}
                  role="button"
                  tabIndex={0}
                  aria-label={`${task.name}, ${task.scheduledStart} sampai ${task.scheduledEnd}`}
                  onPointerDown={(event) => startDrag(event, task, 'move')}
                  onPointerMove={onPointerMove}
                  onPointerUp={(event) => void finishDrag(event)}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onEditTask(task);
                    }
                  }}
                >
                  <title>{tooltip}</title>
                  <rect
                    x={x}
                    y={y + 9}
                    width={barWidth}
                    height={22}
                    rx={4}
                    fill={task.color}
                    fillOpacity={0.28}
                    stroke={strokeColor}
                    strokeWidth={showCritical && isCritical ? 2 : 1}
                    pointerEvents="all"
                  />
                  <rect
                    x={x}
                    y={y + 9}
                    width={(barWidth * task.progress) / 100}
                    height={22}
                    rx={4}
                    fill={task.color}
                    fillOpacity={0.9}
                    pointerEvents="none"
                  />
                  {barWidth > 64 ? (
                    <text
                      x={x + 6}
                      y={y + 24}
                      fontSize={10}
                      fill="#0f172a"
                      fillOpacity={0.75}
                      pointerEvents="none"
                    >
                      {task.name.length > Math.floor(barWidth / 6)
                        ? `${task.name.slice(0, Math.max(6, Math.floor(barWidth / 6) - 1))}…`
                        : task.name}
                    </text>
                  ) : null}
                  <rect
                    x={x + barWidth - 5}
                    y={y + 11}
                    width={8}
                    height={18}
                    rx={2}
                    fill={strokeColor}
                    fillOpacity={0.5}
                    className="cursor-ew-resize"
                    data-handle="resize"
                    onPointerDown={(event) => startDrag(event, task, 'resize')}
                  >
                    <title>Tarik untuk mengubah durasi</title>
                  </rect>
                </g>
              );
            })}

            {showToday ? (
              <g pointerEvents="none">
                <line
                  x1={todayIndex * dayWidth + dayWidth / 2}
                  x2={todayIndex * dayWidth + dayWidth / 2}
                  y1={0}
                  y2={svgHeight}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text
                  x={todayIndex * dayWidth + dayWidth / 2 + 4}
                  y={10}
                  fontSize={9}
                  fill="#ef4444"
                  fontWeight={600}
                >
                  Hari ini
                </text>
              </g>
            ) : null}
          </svg>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded p-1 transition',
        danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
      )}
    >
      <svg viewBox="0 0 18 18" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        {children}
      </svg>
    </button>
  );
}
