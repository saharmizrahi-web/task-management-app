export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "new" | "in_progress" | "paused" | "done";
export type ViewType = "kanban" | "todo" | "calendar";

export interface Space {
  id: number;
  name: string;
  color: string;
  view: ViewType;
  position: number;
}

export interface Task {
  id: number;
  space_id: number;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due_date: string | null; // YYYY-MM-DD
  completed_at: string | null;
  position: number;
  created_at: string;
}

export interface AppData {
  spaces: Space[];
  tasks: Task[];
  dashboardSpaceIds: number[] | null; // null = all spaces
}
