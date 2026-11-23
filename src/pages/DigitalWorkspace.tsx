import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Archive, ArrowUpRight, CheckCircle2, ClipboardList, CloudUpload, Download,
  FileText, FolderKanban, History, Link2, Loader2, Plus, RefreshCw,
  RotateCcw, Search, ShieldCheck, Trash2, Pin, PinOff, Copy, FileSpreadsheet,
} from "lucide-react";
import DeviceNote from "@/components/DeviceNote";
import WorkspaceItemEditor from "@/components/workspace/WorkspaceItemEditor";
import WorkspaceTaskEditor from "@/components/workspace/WorkspaceTaskEditor";
import WorkspaceTaskChecklist from "@/components/workspace/WorkspaceTaskChecklist";
import WorkspaceImportPanel from "@/components/workspace/WorkspaceImportPanel";
import WorkspaceRecoveryCenter from "@/components/workspace/WorkspaceRecoveryCenter";
import WorkspaceGlobalSearch from "@/components/workspace/WorkspaceGlobalSearch";
import WorkspaceTaskFocus from "@/components/workspace/WorkspaceTaskFocus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { readCopies } from "@/lib/workspaceNotes.mjs";
import {
  MAX_WORKSPACE_FILE_BYTES, WORKSPACE_BUCKET, WORKSPACE_EVENT_LABELS,
  WORKSPACE_MIME_TYPES, validWorkspaceLink, workspaceFileAllowed, workspaceFileKey,
} from "@/lib/workspaceRules.mjs";
import type { Database } from "@/integrations/supabase/types";
import { buildWorkspaceExport, filterWorkspaceItems, filterWorkspaceTasks, workspaceExportFileName } from "@/lib/workspaceLibrary.mjs";
import { createWorkspaceArchiveV3 } from "@/lib/workspaceChecklistArchive.mjs";
import { fetchWorkspaceChecklistSnapshot } from "@/lib/workspaceChecklistPaging.mjs";
import { filterScheduledTasks, localCalendarDate, scheduleLabel } from "@/lib/workspaceRestore.mjs";
import { fetchWorkspaceRows } from "@/lib/workspacePaging.mjs";
import { buildWorkspaceTasksCsv, workspaceTaskProgress, copyWorkspaceTask } from "@/lib/workspaceTaskOps.mjs";
import { WORKSPACE_TASK_PRIORITIES, filterWorkspaceTaskPriority,
  sortWorkspaceProjectTasks, validWorkspacePriority } from "@/lib/workspaceTaskFocus.mjs";
import {
  WORKSPACE_PROJECT_LIMIT, WORKSPACE_TASK_LIMIT, WORKSPACE_ITEM_LIMIT,
  WORKSPACE_REGISTERED_FILE_BYTES_LIMIT,
  sortWorkspaceProjects, workspaceRegisteredBytes, workspaceByteLabel,
} from "@/lib/workspaceInsights.mjs";

type Project = Database["public"]["Tables"]["workspace_projects"]["Row"];
type Task = Database["public"]["Tables"]["workspace_tasks"]["Row"];
type Item = Database["public"]["Tables"]["workspace_items"]["Row"];
type Activity = Database["public"]["Tables"]["workspace_activity"]["Row"];
type LocalCopy = { id: string; title: string; body: string };

const launchpads = [
  { title: "Developer Studio", to: "/developer-studio" },
  { title: "Cybersecurity Hub", to: "/cybersecurity" },
  { title: "AI Arsenal", to: "/ai-arsenal" },
  { title: "Cloud & Integrations", to: "/integrations" },
  { title: "Automation", to: "/automation" },
] as const;

const dateText = (value: string) => new Date(value).toLocaleString();
const itemTitle = (item: Item) => item.title || "Untitled";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "The operation could not be completed.";
const requireResult = (error: { message: string } | null, result?: unknown) => {
  if (error) throw new Error(error.message);
  if (result === null) throw new Error("No record was changed. Refresh and check your access.");
};

export default function DigitalWorkspace() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  const owner = user?.id ?? null;
  const [searchParams] = useSearchParams();
  const capturePath = searchParams.get("save") ?? "";
  const captureLabel = searchParams.get("label") ?? "Saved ETERNYX page";
  const currentOwner = useRef<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [resumeFingerprint, setResumeFingerprint] = useState<string | null>(null);
  const [recoveryRefreshKey, setRecoveryRefreshKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newTaskDetails, setNewTaskDetails] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("normal");
  const [taskFilter, setTaskFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [taskSort, setTaskSort] = useState("due");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [taskQuery, setTaskQuery] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [itemQuery, setItemQuery] = useState("");
  const [itemMode, setItemMode] = useState<"note" | "link">("note");
  const [itemName, setItemName] = useState("");
  const [itemBody, setItemBody] = useState("");
  const [localCopies, setLocalCopies] = useState<LocalCopy[] | null>(null);
  const [localId, setLocalId] = useState("");

  const load = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      // RLS is authoritative; these explicit filters also avoid accidental data mixing in UI.
      const [projectRows, taskRows, itemRows, eventResult] = await Promise.all([
        fetchWorkspaceRows(supabase, "workspace_projects", userId, "updated_at"),
        fetchWorkspaceRows(supabase, "workspace_tasks", userId),
        fetchWorkspaceRows(supabase, "workspace_items", userId),
        supabase.from("workspace_activity").select("*").eq("owner_id", userId)
          .order("created_at", { ascending: false }).limit(30),
      ]);
      if (eventResult.error) throw new Error(eventResult.error.message);
      if (currentOwner.current !== userId) return;
      const nextProjects = projectRows as Project[];
      setProjects(nextProjects);
      setTasks(taskRows as Task[]);
      setItems(itemRows as Item[]);
      setActivity((eventResult.data ?? []) as Activity[]);
      setProjectId((previous) => nextProjects.some((project) => project.id === previous)
        ? previous : nextProjects[0]?.id ?? null);
      setLoadedOwner(userId);
      setError("");
    } catch (failure) {
      if (currentOwner.current === userId) setError(
        "Workspace data is unavailable: " + messageFrom(failure) +
        " Check that the workspace migration is deployed and try again."
      );
    } finally {
      if (currentOwner.current === userId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    currentOwner.current = owner;
    setProjects([]);
    setTasks([]);
    setItems([]);
    setActivity([]);
    setProjectId(null);
    setResumeFingerprint(null);
    setRecoveryRefreshKey(0);
    setLoadedOwner(null);
    setError("");
    setNotice("");
    setLoading(Boolean(owner));
    if (owner) void load(owner);
  }, [owner, load]);

  // A pillar handoff prepares a link; it never silently writes an item.
  useEffect(() => {
    if (!capturePath || !validWorkspaceLink(capturePath)) return;
    setItemMode("link");
    setItemName(captureLabel.slice(0, 160));
    setItemBody(capturePath);
    setNotice("Choose an active project, then confirm Save link to keep this page.");
  }, [capturePath, captureLabel]);

  const selected = projects.find((project) => project.id === projectId) ?? null;
  const projectTasks = tasks.filter((task) => task.project_id === projectId);
  const projectItems = items.filter((item) => item.project_id === projectId);
  const shownTasks = sortWorkspaceProjectTasks(filterWorkspaceTaskPriority(
    filterScheduledTasks(filterWorkspaceTasks(projectTasks, taskFilter, taskQuery), scheduleFilter, localCalendarDate()),
    priorityFilter), taskSort);
  const shownItems = filterWorkspaceItems(projectItems, itemFilter, itemQuery);
  const active = selected?.status === "active";
  const visibleProjects = sortWorkspaceProjects(projects.filter((project) =>
    (showArchived || project.status === "active") &&
    (project.name + " " + project.description).toLowerCase().includes(search.toLowerCase())
  ));
  const openTaskCount = useMemo(() => tasks.filter((task) => task.status !== "done").length, [tasks]);
  const fileCount = useMemo(() => items.filter((item) => item.kind === "file").length, [items]);
  const registeredBytes = useMemo(() => workspaceRegisteredBytes(items), [items]);
  const remainingTaskCount = projectTasks.filter((task) => task.status !== "done").length;
  const taskProgress = workspaceTaskProgress(projectTasks, localCalendarDate());

  useEffect(() => {
    setEditName(selected?.name ?? "");
    setEditDescription(selected?.description ?? "");
  }, [selected?.id, selected?.updated_at]);

  const mutate = async (action: () => Promise<void>, success: string) => {
    if (!owner || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (currentOwner.current !== owner) return;
      await load(owner);
      if (currentOwner.current === owner) setNotice(success);
    } catch (failure) {
      if (currentOwner.current === owner) setError(messageFrom(failure));
    } finally {
      if (currentOwner.current === owner) setBusy(false);
    }
  };

  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner || !newProjectName.trim()) return;
    if (projects.length >= WORKSPACE_PROJECT_LIMIT) {
      setError("Project cap reached (100 per account). Archive does not free a project slot.");
      return;
    }
    void mutate(async () => {
      const { data, error: insertError } = await supabase.from("workspace_projects")
        .insert({ owner_id: owner, name: newProjectName.trim(), description: newProjectDescription.trim() })
        .select("id").single();
      requireResult(insertError, data);
      setNewProjectName("");
      setNewProjectDescription("");
      setProjectId(data!.id);
    }, "Your project was created.");
  };

  const saveProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner || !selected || !active || !editName.trim()) return;
    void mutate(async () => {
      const { data, error: updateError } = await supabase.from("workspace_projects")
        .update({ name: editName.trim(), description: editDescription.trim() })
        .eq("id", selected.id).eq("owner_id", owner).select("id").maybeSingle();
      requireResult(updateError, data);
    }, "Project details saved.");
  };

  const setArchive = (archive: boolean) => {
    if (!owner || !selected) return;
    if (archive && !window.confirm("Archive this project? Its tasks and files will remain accessible.")) return;
    void mutate(async () => {
      const { data, error: updateError } = await supabase.from("workspace_projects")
        .update({ status: archive ? "archived" : "active" })
        .eq("id", selected.id).eq("owner_id", owner).select("id").maybeSingle();
      requireResult(updateError, data);
      if (archive) setShowArchived(true);
    }, archive ? "Project archived without deleting its data." : "Project restored.");
  };

  const pinProject = () => {
    if (!owner || !selected) return;
    void mutate(async () => {
      const { data, error: updateError } = await supabase.from("workspace_projects")
        .update({ pinned: !selected.pinned }).eq("id", selected.id).eq("owner_id", owner)
        .select("id").maybeSingle();
      requireResult(updateError, data);
    }, selected.pinned ? "Project unpinned." : "Project pinned to the top of your list.");
  };

  const finishRemainingTasks = () => {
    if (!owner || !selected || !active || !remainingTaskCount) return;
    if (!window.confirm("Mark all " + remainingTaskCount + " unfinished tasks in this project as done?")) return;
    void mutate(async () => {
      const { data, error: updateError } = await supabase.from("workspace_tasks")
        .update({ status: "done" }).eq("owner_id", owner)
        .eq("project_id", selected.id).neq("status", "done").select("id");
      if (updateError) throw new Error(updateError.message);
      if (!data?.length) throw new Error("No tasks were changed. The project may have been archived or updated in another tab.");
    }, "Remaining project tasks marked complete.");
  };

  const deleteArchivedProject = () => {
    if (!owner || !selected || selected.status !== "archived") return;
    if (projectItems.some((item) => item.kind === "file")) {
      setError("Restore this project, delete its private files through Workspace, then archive it again before permanent deletion.");
      return;
    }
    if (window.prompt("Permanently delete archived project " + selected.name +
      " with ALL tasks, saved notes, links, revisions and activity? This cannot be undone. Type DELETE to confirm:") !== "DELETE") return;
    void mutate(async () => {
      const { data, error: removeError } = await supabase.rpc("workspace_delete_archived_project",
        { p_project_id: selected.id });
      if (removeError) throw new Error(removeError.message);
      if (!data) throw new Error("The server did not confirm project removal.");
    }, "Archived project permanently deleted. This account slot is now available.");
  };

  const reopenCompletedTasks = () => {
    if (!owner || !selected || !active || !taskProgress.done) return;
    if (!window.confirm("Reopen all " + taskProgress.done + " completed tasks in this project? Their completion timestamps will be cleared.")) return;
    void mutate(async () => {
      const { data, error: updateError } = await supabase.from("workspace_tasks")
        .update({ status: "todo" }).eq("owner_id", owner).eq("project_id", selected.id)
        .eq("status", "done").select("id");
      if (updateError) throw new Error(updateError.message);
      if (!data?.length) throw new Error("No completed tasks were changed. Refresh and try again.");
    }, "Previously completed project tasks reopened.");
  };

  const duplicateTask = (task: Task) => {
    if (!owner || !selected || !active || busy) return;
    if (tasks.length >= WORKSPACE_TASK_LIMIT) {
      setError("Task quota reached; the copy was not created.");
      return;
    }
    if (!window.confirm("Duplicate task " + task.title + " as a fresh, unfinished task? Checklist steps and completion history are not copied.")) return;
    void mutate(async () => {
      const payload = copyWorkspaceTask(task, owner, selected.id);
      const { error: insertError } = await supabase.from("workspace_tasks").insert(payload);
      if (insertError) throw new Error(insertError.message);
    }, "Task duplicated as an unfinished copy. Checklist steps were not copied.");
  };

  const downloadTaskCsv = () => {
    if (!selected) return;
    try {
      const csv = buildWorkspaceTasksCsv(selected, projectTasks);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = workspaceExportFileName(selected.name).replace(/\.json$/, "-tasks.csv");
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice("Exported actual project tasks as spreadsheet-safe CSV. Checklist steps are not in this CSV.");
      setError("");
    } catch (failure) { setError(messageFrom(failure)); }
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner || !selected || !active || !newTask.trim()) return;
    if (!validWorkspacePriority(newTaskPriority)) { setError("Choose an allowed priority."); return; }
    if (newTaskDetails.length > 4000) { setError("Task details must be 4,000 characters or fewer."); return; }
    if (tasks.length >= WORKSPACE_TASK_LIMIT) {
      setError("Task cap reached (5,000 per account).");
      return;
    }
    void mutate(async () => {
      const { error: insertError } = await supabase.from("workspace_tasks")
        .insert({ owner_id: owner, project_id: selected.id, title: newTask.trim(),
          status: "todo", due_on: taskDue || null, priority: newTaskPriority,
          details: newTaskDetails });
      requireResult(insertError);
      setNewTask("");
      setNewTaskDetails("");
      setTaskDue("");
      setNewTaskPriority("normal");
    }, "Task added to the project.");
  };

  const updateTask = (task: Task, status: string) => {
    if (!owner || !active || !["todo", "in_progress", "done"].includes(status)) return;
    void mutate(async () => {
      const { data, error: updateError } = await supabase.from("workspace_tasks")
        .update({ status }).eq("id", task.id).eq("owner_id", owner)
        .eq("updated_at", task.updated_at).select("id").maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!data) throw new Error("Task was changed in another tab or is no longer editable. Refresh before editing.");
    }, "Task status updated.");
  };

  const deleteTask = (task: Task) => {
    if (!owner || !active || !window.confirm("Delete this task?")) return;
    void mutate(async () => {
      const { data, error: deleteError } = await supabase.from("workspace_tasks")
        .delete().eq("id", task.id).eq("owner_id", owner).select("id").maybeSingle();
      requireResult(deleteError, data);
    }, "Task deleted.");
  };

  const saveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner || !selected || !active || !itemName.trim()) return;
    if (items.length >= WORKSPACE_ITEM_LIMIT) {
      setError("Saved item cap reached (5,000 per account).");
      return;
    }
    if (itemMode === "link" && !validWorkspaceLink(itemBody)) {
      setError("Use a secure https:// link or a relative ETERNYX path beginning with one slash.");
      return;
    }
    if (itemMode === "note" && (!itemBody.trim() || itemBody.length > 12000)) {
      setError("Write a note between 1 and 12,000 characters.");
      return;
    }
    void mutate(async () => {
      const { error: insertError } = await supabase.from("workspace_items").insert({
        owner_id: owner, project_id: selected.id, kind: itemMode, title: itemName.trim(),
        note_text: itemMode === "note" ? itemBody.trim() : null,
        target_url: itemMode === "link" ? itemBody.trim() : null,
      });
      requireResult(insertError);
      setItemName("");
      setItemBody("");
    }, itemMode === "note" ? "Note saved to the project." : "Link saved to the project.");
  };

  const uploadFile = () => {
    if (!owner || !selected || !active) return;
    const file = filePicker.current?.files?.[0];
    if (!workspaceFileAllowed(file)) {
      setError("Choose a supported PDF, image, text, CSV or JSON file between 1 byte and 5 MiB.");
      return;
    }
    if (items.length >= WORKSPACE_ITEM_LIMIT || registeredBytes + file!.size > WORKSPACE_REGISTERED_FILE_BYTES_LIMIT) {
      setError("Registered Workspace limit reached: 5,000 saved items or 100 MiB of registered files per account.");
      return;
    }
    void mutate(async () => {
      const key = workspaceFileKey(owner, selected.id, file!.name, crypto.randomUUID());
      const { error: uploadError } = await supabase.storage.from(WORKSPACE_BUCKET)
        .upload(key, file!, { upsert: false, contentType: file!.type });
      if (uploadError) throw new Error(uploadError.message);
      const { error: itemError } = await supabase.from("workspace_items").insert({
        owner_id: owner, project_id: selected.id, kind: "file",
        title: file!.name.slice(0, 160), storage_path: key,
        file_size: file!.size, mime_type: file!.type,
      });
      if (itemError) {
        const cleanup = await supabase.storage.from(WORKSPACE_BUCKET).remove([key]);
        throw new Error(itemError.message + (cleanup.error
          ? " Upload cleanup also failed; contact support with your project ID." : " Uploaded file was cleaned up."));
      }
      if (filePicker.current) filePicker.current.value = "";
    }, "Private file uploaded and registered.");
  };

  const downloadFile = (item: Item) => {
    if (!owner || !item.storage_path) return;
    void mutate(async () => {
      const { data, error: downloadError } = await supabase.storage.from(WORKSPACE_BUCKET)
        .download(item.storage_path!);
      if (downloadError || !data) throw new Error(downloadError?.message || "File could not be downloaded.");
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.title;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, "Private file download started.");
  };

  const deleteItem = (item: Item) => {
    if (!owner || !active || !window.confirm("Remove this saved item" +
      (item.kind === "file" ? " and delete its private file" : "") + "?")) return;
    void mutate(async () => {
      // Remove the database record first. Previously the file was deleted before
      // this permission-checked operation, which could leave a broken record if
      // the database deletion failed. Recover metadata when Storage fails.
      const { data, error: deleteError } = await supabase.from("workspace_items")
        .delete().eq("id", item.id).eq("owner_id", owner).select("id").maybeSingle();
      if (deleteError || !data) throw new Error(
        "Metadata removal failed; the private file was left untouched. " +
        (deleteError?.message || "The record was not deleted."));
      if (item.kind === "file" && item.storage_path) {
        const { error: storageError } = await supabase.storage.from(WORKSPACE_BUCKET)
          .remove([item.storage_path]);
        if (storageError) {
          // Object remains in private Storage. Re-register it so the owner can
          // download it or retry deletion, rather than strand its only listing.
          const { error: restoreError } = await supabase.from("workspace_items").insert({
            owner_id: owner, project_id: item.project_id, kind: "file",
            title: item.title, storage_path: item.storage_path,
            file_size: item.file_size, mime_type: item.mime_type,
          });
          throw new Error(restoreError
            ? "Private file removal failed and its listing could not be restored. Contact support; your file may still be in private Storage. " + storageError.message
            : "Private file removal failed; the listing was restored so you can retry. " + storageError.message);
        }
      }
    }, "Item removed.");
  };

  const browseLocal = () => {
    try {
      const copies = readCopies(localStorage) as LocalCopy[];
      setLocalCopies(copies);
      setLocalId(copies[0]?.id ?? "");
      setError("");
    } catch {
      setError("Device notes cannot be read in this browser.");
    }
  };

  const importLocal = () => {
    if (!owner || !selected || !active) return;
    const copy = localCopies?.find((entry) => entry.id === localId);
    if (!copy) return;
    if (!copy.body.trim() || copy.body.length > 12000) {
      setError("This local copy is empty or too long (12,000-character limit).");
      return;
    }
    if (!window.confirm("Copy this browser-profile note into your private signed-in workspace?")) return;
    void mutate(async () => {
      const { error: insertError } = await supabase.from("workspace_items").insert({
        owner_id: owner, project_id: selected.id, kind: "note",
        title: copy.title.slice(0, 160), note_text: copy.body,
      });
      requireResult(insertError);
    }, "Selected device note imported. The original local copy was not changed.");
  };

  const exportProject = (mode: "legacy" | "checklists" | "complete") => {
    if (!owner || !selected) return;
    const includeFiles = mode === "complete";
    const includeSteps = mode !== "legacy";
    if (!window.confirm(includeFiles
      ? "Download an ETERNYX v3 checklist archive WITH private file bytes? This is sensitive data. Limit 1,000 tasks, 30 steps each, 8 files / 12 MiB; no old revisions or activity history."
      : includeSteps
        ? "Download an ETERNYX v3 checklist archive with actual task steps, notes and links? File bytes and historical revisions are excluded; limit 1,000 tasks."
        : "Download a legacy v1 JSON export? This omits checklist steps, private file bytes and history.")) return;
    void mutate(async () => {
      // Fetch ALL rows for this project, not just the dashboard's initial 1000.
      // An incomplete export is an error, never represented as a full backup.
      const pullTasks = async (): Promise<Task[]> => {
        const result: Task[] = [];
        for (let start = 0; start <= 10000; start += 500) {
          const { data, error: queryError } = await supabase.from("workspace_tasks").select("*")
            .eq("owner_id", owner).eq("project_id", selected.id)
            .order("id", { ascending: true }).range(start, start + 499);
          if (queryError) throw new Error(queryError.message);
          const batch = (data ?? []) as Task[];
          if (start >= 10000 && batch.length) throw new Error("Export limit reached (10,000 tasks). Contact support for a larger backup.");
          result.push(...batch);
          if (batch.length < 500) break;
        }
        return result;
      };
      const pullItems = async (): Promise<Item[]> => {
        const result: Item[] = [];
        for (let start = 0; start <= 10000; start += 500) {
          const { data, error: queryError } = await supabase.from("workspace_items").select("*")
            .eq("owner_id", owner).eq("project_id", selected.id)
            .order("id", { ascending: true }).range(start, start + 499);
          if (queryError) throw new Error(queryError.message);
          const batch = (data ?? []) as Item[];
          if (start >= 10000 && batch.length) throw new Error("Export limit reached (10,000 items). Contact support for a larger backup.");
          result.push(...batch);
          if (batch.length < 500) break;
        }
        return result;
      };
      const [allTasks, allItems] = await Promise.all([pullTasks(), pullItems()]);
      // An incomplete step list must reject the entire archive. V1 remains
      // separately available when the account exceeds v3 bounded limits.
      const steps = includeSteps
        ? await fetchWorkspaceChecklistSnapshot(supabase, owner, allTasks)
        : [];
      const download = async (path: string) => {
        const { data, error: storageError } = await supabase.storage.from(WORKSPACE_BUCKET).download(path);
        if (storageError || !data) throw new Error("Private backup download failed: " +
          (storageError?.message ?? "file unavailable"));
        return data;
      };
      const content = includeSteps
        ? await createWorkspaceArchiveV3(selected, allTasks, allItems, steps,
          includeFiles ? download : null)
        : JSON.stringify(buildWorkspaceExport(selected, allTasks, allItems), null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = mode === "complete"
        ? workspaceExportFileName(selected.name).replace(/\.json$/, "-complete-v3.json")
        : mode === "checklists"
          ? workspaceExportFileName(selected.name).replace(/\.json$/, "-checklists-v3.json")
          : workspaceExportFileName(selected.name);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, includeFiles
      ? "Full v3 archive download started. Current checklist steps and private file bytes included."
      : includeSteps
        ? "V3 checklist archive download started. Private file bytes and revisions are not included."
        : "Legacy export download started without checklist steps or private file bytes.");
  };

  const ownedDataVisible = Boolean(owner && loadedOwner === owner);

  return <main className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-6 text-foreground sm:px-6">
    <header className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">ETERNYX / Digital Workspace</p>
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
        <FolderKanban className="h-9 w-9 text-cyan-400" aria-hidden="true" /> Your command center
      </h1>
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
        Organize real projects, complete tasks, keep private files, save work and return to it.
        Every project, task and saved item is scoped to your signed-in account.
      </p>
      <nav aria-label="Open another ETERNYX pillar" className="flex flex-wrap gap-2">
        {launchpads.map((entry) => <Link key={entry.to} to={entry.to}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs hover:border-cyan-400 focus-visible:ring-2">
          {entry.title} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>)}
      </nav>
    </header>

    {!owner && <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-xl font-semibold">Sign in to manage private projects</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Project and file synchronization requires an account. The device scratchpad below still works locally.
      </p>
      {authLoading ? <p className="mt-3" role="status">Restoring your session…</p> :
        <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>}
    </section>}

    {owner && <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-cyan-400" aria-hidden="true" /> Private, account-owned records
        </p>
        <Button variant="outline" size="sm" disabled={busy || loading} onClick={() => void load(owner)}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Refresh
        </Button>
      </div>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your saved work…
      </p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-border p-3 text-sm text-cyan-300">{notice}</p>}
      {ownedDataVisible && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Actual workspace totals">
          <Summary title="Owned projects" value={projects.length} subtitle={"Limit " + WORKSPACE_PROJECT_LIMIT + " (including archives)"} />
          <Summary title="Open tasks" value={openTaskCount} subtitle={tasks.length + " of " + WORKSPACE_TASK_LIMIT + " tasks registered"} />
          <Summary title="Private files" value={fileCount} subtitle={items.length + " of " + WORKSPACE_ITEM_LIMIT + " saved items"} />
          <Summary title="Registered file bytes" value={workspaceByteLabel(registeredBytes)}
            subtitle={"Limit " + workspaceByteLabel(WORKSPACE_REGISTERED_FILE_BYTES_LIMIT) + "; orphan objects not counted"} />
        </div>

        <WorkspaceGlobalSearch projects={projects} tasks={tasks} items={items}
          onOpen={(result) => {
            const target = projects.find((entry) => entry.id === result.projectId);
            if (target?.status === "archived") setShowArchived(true);
            setSearch("");
            setProjectId(result.projectId);
            setTaskFilter("all"); setScheduleFilter("all"); setPriorityFilter("all");
            setTaskQuery(result.kind === "task" ? result.title : "");
            setItemFilter("all"); setItemQuery(result.kind === "item" ? result.title : "");
            setNotice("Opened " + result.projectName + " for " + result.kind + " · " + result.title + ".");
            const targetId = result.kind === "task" ? "workspace-project-tasks"
              : result.kind === "item" ? "workspace-project-saved-items" : "workspace-project-panel";
            window.setTimeout(() => document.getElementById(targetId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" }), 25);
          }} />

        <WorkspaceTaskFocus projects={projects} tasks={tasks} disabled={busy}
          onOpen={(targetProjectId, targetTaskId) => {
            const found = tasks.find((task) => task.id === targetTaskId);
            if (projects.some((project) => project.id === targetProjectId && project.status === "archived")) {
              setShowArchived(true);
            }
            setSearch("");
            setProjectId(targetProjectId);
            setTaskFilter("all"); setScheduleFilter("all"); setPriorityFilter("all");
            setTaskQuery(found?.title ?? "");
            window.setTimeout(() => document.getElementById("workspace-project-tasks")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }), 25);
          }}
          onComplete={(task) => updateTask(task, "done")} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
          <aside className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-xl font-semibold">Projects</h2>
            <form className="space-y-3" onSubmit={createProject}>
              <label htmlFor="workspace-project-new" className="text-sm font-medium">New project</label>
              <Input id="workspace-project-new" value={newProjectName} maxLength={120}
                placeholder="Project name" onChange={(event) => setNewProjectName(event.target.value)} required />
              <Textarea aria-label="Project description" rows={2} maxLength={2000}
                placeholder="Purpose (optional)" value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)} />
              <Button type="submit" disabled={busy || projects.length >= WORKSPACE_PROJECT_LIMIT || !newProjectName.trim()} className="w-full">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create project
              </Button>
            </form>
            <WorkspaceImportPanel owner={owner} disabled={busy || loading}
              resumeFingerprint={resumeFingerprint}
              onResumeConsumed={() => setResumeFingerprint(null)}
              onImported={(id, message, failed) => {
                setProjectId(id);
                setRecoveryRefreshKey(value => value + 1);
                void load(owner).then(() => {
                  if (failed) setError(message);
                  else setNotice(message);
                });
              }} />
            <WorkspaceRecoveryCenter owner={owner} disabled={busy || loading}
              projects={projects} refreshKey={recoveryRefreshKey}
              onOpen={(id) => {
                setShowArchived(true);
                setSearch("");
                setProjectId(id);
                window.setTimeout(() =>
                  document.getElementById("workspace-project-panel")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }), 25);
              }}
              onResume={(fingerprint) => {
                setResumeFingerprint(fingerprint);
                (document.getElementById("workspace-import-file") as HTMLInputElement | null)?.click();
              }}
              onDiscarded={() => {
                setRecoveryRefreshKey(value => value + 1);
                void load(owner);
              }} />
            <div className="space-y-3 border-t border-border pt-4">
              <label htmlFor="workspace-project-search" className="text-sm font-medium">Find a project</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="workspace-project-search" className="pl-9" value={search}
                  onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Include archived
              </label>
              <div className="space-y-2" aria-label="Saved projects">
                {visibleProjects.map((project) => <button type="button" key={project.id}
                  onClick={() => setProjectId(project.id)} aria-current={projectId === project.id ? "page" : undefined}
                  className={"w-full rounded-lg border p-3 text-left focus-visible:ring-2 " +
                    (projectId === project.id ? "border-cyan-400 bg-cyan-400/10" : "border-border hover:border-cyan-400/50")}>
                  <span className="block break-words text-sm font-semibold">{project.pinned ? "📌 " : ""}{project.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {project.status === "archived" ? "Archived" : "Active"} · Updated {dateText(project.updated_at)}
                  </span>
                </button>)}
                {!visibleProjects.length && <p className="text-sm text-muted-foreground">
                  {projects.length ? "No matching projects." : "Create your first project to begin."}
                </p>}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {!selected && <section className="rounded-2xl border border-border bg-card p-8">
              <FolderKanban className="mb-3 h-8 w-8 text-cyan-400" aria-hidden="true" />
              <h2 className="text-xl font-semibold">No project selected</h2>
              <p className="mt-2 text-sm text-muted-foreground">Create or select a project to work with real tasks, notes and files.</p>
            </section>}

            {selected && <>
              <section id="workspace-project-panel" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-cyan-400">
                      {selected.status === "archived" ? "Archived project · read-only" : "Active project"}
                    </p>
                    <h2 className="mt-1 break-words text-2xl font-semibold">{selected.name}</h2>
                  </div>
                  <Button type="button" variant="outline" disabled={busy}
                    onClick={pinProject}>{selected.pinned ? <PinOff className="mr-2 h-4 w-4" aria-hidden="true" /> :
                      <Pin className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {selected.pinned ? "Unpin" : "Pin project"}</Button>
                  <Button type="button" variant="outline" disabled={busy}
                    onClick={() => exportProject("legacy")}><Download className="mr-2 h-4 w-4" aria-hidden="true" /> Legacy JSON</Button>
                  <Button type="button" variant="outline" disabled={busy}
                    onClick={() => exportProject("checklists")}><Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export with checklists</Button>
                  <Button type="button" variant="outline" disabled={busy}
                    onClick={() => exportProject("complete")}><Download className="mr-2 h-4 w-4" aria-hidden="true" /> Backup files + checklists</Button>
                  <Button type="button" variant="outline" disabled={busy}
                    onClick={() => setArchive(active)}>
                    {active ? <Archive className="mr-2 h-4 w-4" aria-hidden="true" /> :
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {active ? "Archive" : "Restore"}
                  </Button>
                  {!active && <Button type="button" variant="destructive" disabled={busy}
                    onClick={deleteArchivedProject}>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Permanently delete archived project
                  </Button>}
                </div>
                {active && <form onSubmit={saveProject} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="workspace-edit-name">Project name</label>
                    <Input id="workspace-edit-name" value={editName} maxLength={120}
                      onChange={(event) => setEditName(event.target.value)} required />
                    <label className="block text-sm font-medium" htmlFor="workspace-edit-description">Description</label>
                    <Textarea id="workspace-edit-description" rows={2} maxLength={2000}
                      value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                  </div>
                  <Button type="submit" variant="outline" className="self-end" disabled={busy || !editName.trim() ||
                    (editName === selected.name && editDescription === selected.description)}>
                    Save details
                  </Button>
                </form>}
                {!active && <p className="text-sm text-muted-foreground">{selected.description || "No description."}</p>}
              </section>

              <section id="workspace-project-tasks" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Tasks ({projectTasks.length})</h2>
                  <Button type="button" variant="outline" size="sm" onClick={downloadTaskCsv}
                    disabled={busy || loading} className="ml-auto">
                    <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" /> Export task CSV
                  </Button>
                  {active && remainingTaskCount > 0 && <Button type="button" size="sm" variant="outline"
                    disabled={busy} onClick={finishRemainingTasks}>
                    <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Complete remaining ({remainingTaskCount})
                  </Button>}
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{taskProgress.done} of {taskProgress.total} tasks complete ({taskProgress.percentage}%) ·
                    {" " + taskProgress.open} open · {taskProgress.overdue} overdue ·
                    {" " + taskProgress.urgentOpen} urgent open</p>
                  <div role="progressbar" aria-label="Project task completion"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={taskProgress.percentage}
                    className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-cyan-500"
                      style={{ width: taskProgress.percentage + "%" }} />
                  </div>
                  {active && taskProgress.done > 0 && <Button type="button" size="sm"
                    variant="outline" disabled={busy} onClick={reopenCompletedTasks}>
                    <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" /> Reopen completed ({taskProgress.done})
                  </Button>}
                </div>
                {active && <form className="flex flex-wrap items-end gap-2" onSubmit={createTask}>
                  <div className="min-w-[180px] flex-1 space-y-2">
                    <label htmlFor="workspace-task-name" className="text-sm font-medium">Task</label>
                    <Input id="workspace-task-name" value={newTask} maxLength={200} required
                      placeholder="What needs to be done?" onChange={(event) => setNewTask(event.target.value)} />
                  </div>
                  <div className="min-w-[200px] flex-1 space-y-2">
                    <label htmlFor="workspace-task-details" className="block text-sm font-medium">Instructions (optional)</label>
                    <Textarea id="workspace-task-details" rows={2} maxLength={4000}
                      value={newTaskDetails} placeholder="Instructions or acceptance criteria"
                      onChange={event => setNewTaskDetails(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="workspace-task-due" className="block text-sm font-medium">Due (optional)</label>
                    <Input type="date" id="workspace-task-due" value={taskDue}
                      onChange={(event) => setTaskDue(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="workspace-new-task-priority" className="block text-sm font-medium">Priority</label>
                    <select id="workspace-new-task-priority" value={newTaskPriority}
                      onChange={(event) => setNewTaskPriority(event.target.value)}
                      className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                      {WORKSPACE_TASK_PRIORITIES.map(priority => <option key={priority} value={priority}>
                        {priority.slice(0, 1).toUpperCase() + priority.slice(1)}
                      </option>)}
                    </select>
                  </div>
                  <Button type="submit" disabled={busy || !newTask.trim()}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add task
                  </Button>
                </form>}
                <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
                  <label htmlFor="workspace-task-filter" className="text-sm">Status</label>
                  <select id="workspace-task-filter" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="all">All</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option>
                  </select>
                  <label htmlFor="workspace-task-schedule" className="text-sm">Due</label>
                  <select id="workspace-task-schedule" value={scheduleFilter} onChange={(event) => setScheduleFilter(event.target.value)}
                    className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="all">Any date</option><option value="overdue">Overdue</option>
                    <option value="today">Due today</option><option value="upcoming">Upcoming</option>
                    <option value="unscheduled">No due date</option>
                  </select>
                  <label htmlFor="workspace-task-priority" className="text-sm">Priority</label>
                  <select id="workspace-task-priority" value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="all">All</option>
                    {WORKSPACE_TASK_PRIORITIES.map(priority => <option key={priority} value={priority}>
                      {priority.slice(0, 1).toUpperCase() + priority.slice(1)}
                    </option>)}
                  </select>
                  <label htmlFor="workspace-task-sort" className="text-sm">Sort</label>
                  <select id="workspace-task-sort" value={taskSort} onChange={(event) => setTaskSort(event.target.value)}
                    className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="due">Due date</option><option value="priority">Priority</option>
                    <option value="recent">Recently changed</option><option value="status">Open first</option>
                  </select>
                  <label htmlFor="workspace-task-search" className="sr-only">Find a task</label>
                  <Input id="workspace-task-search" placeholder="Search task names / due dates" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} className="min-w-[180px] flex-1" />
                </div>
                <div className="divide-y divide-border">
                  {shownTasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className={"block break-words text-sm font-medium " +
                        (task.status === "done" ? "text-muted-foreground line-through" : "")}>{task.title}</span>
                      <span className={"text-xs " + (task.due_on && task.due_on < localCalendarDate() && task.status !== "done" ? "text-amber-400" : "text-muted-foreground")}>
                        {task.priority + " priority · " + (task.due_on ? task.due_on + " · " + (task.status === "done" ? "Completed" : scheduleLabel(task.due_on, localCalendarDate())) : "No due date")}
                      </span>
                      {task.status === "done" && <span className="block text-xs text-muted-foreground">
                        {task.completed_at ? "Completed " + dateText(task.completed_at) :
                          "Completion time unavailable for historical task"}
                      </span>}
                      {task.details && <span className="mt-1 block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {task.details}
                      </span>}
                    </span>
                    <label className="sr-only" htmlFor={"workspace-task-status-" + task.id}>Task status for {task.title}</label>
                    <select id={"workspace-task-status-" + task.id} value={task.status} disabled={!active || busy}
                      onChange={(event) => updateTask(task, event.target.value)}
                      className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                      <option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option>
                    </select>
                    {active && <WorkspaceTaskEditor task={task} owner={owner} disabled={busy}
                      onRun={(action, message) => void mutate(action, message)} />}
                    {active && <Button size="icon" type="button" variant="ghost" disabled={busy}
                      aria-label={"Duplicate task " + task.title} onClick={() => duplicateTask(task)}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>}
                    {active && <Button size="icon" variant="ghost" disabled={busy}
                      aria-label={"Delete task " + task.title} onClick={() => deleteTask(task)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>}
                    <WorkspaceTaskChecklist task={task} owner={owner!} archived={!active} />
                  </div>)}
                  {!projectTasks.length && <p className="py-4 text-sm text-muted-foreground">No tasks saved for this project.</p>}
                  {!!projectTasks.length && !shownTasks.length && <p className="py-4 text-sm text-muted-foreground">No tasks match this filter.</p>}
                </div>
              </section>

              <section id="workspace-project-saved-items" className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <FileText className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                  Notes, links & files ({projectItems.length})
                </h2>
                {active && <>
                  <form onSubmit={saveItem} className="space-y-3 rounded-xl border border-border p-4">
                    <fieldset className="flex flex-wrap gap-4">
                      <legend className="mb-2 text-sm font-semibold">Save useful work</legend>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="workspace-item-kind" checked={itemMode === "note"}
                          onChange={() => { setItemMode("note"); setItemBody(""); }} /> Note
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="workspace-item-kind" checked={itemMode === "link"}
                          onChange={() => { setItemMode("link"); setItemBody(""); }} /> Link / pillar result
                      </label>
                    </fieldset>
                    <label htmlFor="workspace-item-name" className="block text-sm font-medium">Title</label>
                    <Input id="workspace-item-name" value={itemName} required maxLength={160}
                      onChange={(event) => setItemName(event.target.value)} placeholder="Name the saved item" />
                    <label htmlFor="workspace-item-body" className="block text-sm font-medium">
                      {itemMode === "note" ? "Note" : "HTTPS URL or ETERNYX route"}
                    </label>
                    {itemMode === "note"
                      ? <Textarea id="workspace-item-body" rows={4} maxLength={12000} required value={itemBody}
                          onChange={(event) => setItemBody(event.target.value)} placeholder="Research, results, next steps…" />
                      : <Input id="workspace-item-body" value={itemBody} required maxLength={2000}
                          onChange={(event) => setItemBody(event.target.value)}
                          placeholder="/developer-studio or https://github.com/…" />}
                    <Button type="submit" disabled={busy || !itemName.trim() || !itemBody.trim()}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Save {itemMode}
                    </Button>
                  </form>

                  <div className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <CloudUpload className="h-4 w-4 text-cyan-400" aria-hidden="true" /> Upload private file
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      PDF, PNG, JPEG, WebP, TXT, CSV and JSON. Maximum {MAX_WORKSPACE_FILE_BYTES / 1048576} MiB.
                      Files require an authenticated account and are not public.
                    </p>
                    <input ref={filePicker} type="file" aria-label="Choose a private project file"
                      accept={WORKSPACE_MIME_TYPES.join(",")}
                      className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2" />
                    <Button type="button" variant="outline" disabled={busy} onClick={uploadFile}>Upload file</Button>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="font-semibold">Import an existing device note</h3>
                    <p className="text-xs text-muted-foreground">
                      Local notes are shared with anyone using this browser profile. They are never
                      uploaded automatically; choose a copy and explicitly confirm importing it.
                    </p>
                    <Button type="button" variant="outline" disabled={busy} onClick={browseLocal}>Browse device copies</Button>
                    {localCopies && <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[200px] flex-1 space-y-1">
                        <label htmlFor="workspace-local-import" className="block text-sm font-medium">Saved device copy</label>
                        <select id="workspace-local-import" value={localId}
                          onChange={(event) => setLocalId(event.target.value)}
                          className="min-h-10 w-full rounded-md border border-border bg-background p-2 text-sm">
                          {localCopies.map((copy) => <option key={copy.id} value={copy.id}>{copy.title}</option>)}
                        </select>
                      </div>
                      <Button disabled={busy || !localId} onClick={importLocal}>Import selected note</Button>
                      {!localCopies.length && <p className="text-sm text-muted-foreground">No saved device copies found.</p>}
                    </div>}
                  </div>
                </>}

                <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
                  <label htmlFor="workspace-item-filter" className="text-sm">Type</label>
                  <select id="workspace-item-filter" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)} className="min-h-10 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="all">All</option><option value="note">Notes</option><option value="link">Links</option><option value="file">Files</option>
                  </select>
                  <label htmlFor="workspace-item-search" className="sr-only">Find saved work</label>
                  <Input id="workspace-item-search" placeholder="Search titles and saved text" value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} className="min-w-[180px] flex-1" />
                </div>
                <div className="divide-y divide-border">
                  {shownItems.map((item) => <article key={item.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.kind === "file" ? <Download className="h-4 w-4 text-cyan-400" aria-hidden="true" /> :
                        item.kind === "link" ? <Link2 className="h-4 w-4 text-cyan-400" aria-hidden="true" /> :
                          <FileText className="h-4 w-4 text-cyan-400" aria-hidden="true" />}
                      <strong className="min-w-0 flex-1 break-words text-sm">{itemTitle(item)}</strong>
                      <span className="text-xs text-muted-foreground">{item.kind} · {dateText(item.created_at)}</span>
                      {active && <Button variant="ghost" size="icon" disabled={busy} aria-label={"Remove " + item.title}
                        onClick={() => deleteItem(item)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>}
                    </div>
                    {item.kind === "note" && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.note_text}</p>}
                    {item.kind === "link" && item.target_url && (item.target_url.startsWith("/")
                      ? <Link to={item.target_url} className="inline-flex items-center gap-1 break-all text-sm text-cyan-400 underline">
                          Open saved ETERNYX route <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
                      : <a href={item.target_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 break-all text-sm text-cyan-400 underline">
                          Open saved HTTPS link <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>)}
                    {item.kind !== "file" && <WorkspaceItemEditor key={item.id} item={item} owner={owner!} readOnly={!active} busy={busy} onRun={(action, success) => void mutate(action, success)} />}
                    {item.kind === "file" && <Button type="button" variant="outline" size="sm" disabled={busy}
                      onClick={() => downloadFile(item)}>
                      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                      Download private file ({item.file_size ? Math.ceil(item.file_size / 1024) + " KiB" : "size unavailable"})
                    </Button>}
                  </article>)}
                  {!projectItems.length && <p className="py-4 text-sm text-muted-foreground">
                    No saved work yet. Notes, verified links and uploaded files will appear here.
                  </p>}
                  {!!projectItems.length && !shownItems.length && <p className="py-4 text-sm text-muted-foreground">No saved items match this filter.</p>}
                </div>
              </section>
            </>}
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <History className="h-5 w-5 text-cyan-400" aria-hidden="true" /> Recent saved activity
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Server-recorded project, task and saved-item changes. No invented activity scores.
          </p>
          <ol className="mt-4 space-y-3">
            {activity.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                {WORKSPACE_EVENT_LABELS[event.event_type as keyof typeof WORKSPACE_EVENT_LABELS] || event.event_type}
                <span className="text-xs text-muted-foreground">
                  {projects.find((project) => project.id === event.project_id)?.name || "Project"}
                </span>
              </span>
              <time className="text-xs text-muted-foreground" dateTime={event.created_at}>{dateText(event.created_at)}</time>
            </li>)}
            {!activity.length && <li className="text-sm text-muted-foreground">No recorded activity yet.</li>}
          </ol>
        </section>
      </>}
    </section>}

    <details open className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <summary className="cursor-pointer text-lg font-semibold">Device scratchpad (browser-only)</summary>
      <p className="my-3 text-sm text-muted-foreground">
        Your existing local drafts and copies remain available here. They are not private cloud files and do not sync across devices.
      </p>
      <DeviceNote />
    </details>
  </main>;
}

function Summary({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
  return <div className="rounded-xl border border-border bg-card p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
    <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
  </div>;
}
