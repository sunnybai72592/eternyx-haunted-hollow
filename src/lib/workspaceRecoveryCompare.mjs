// Read-only, multiset comparison. Duplicate names are NOT treated as stable IDs.
// A record is an exact match only if all compared portable fields match.
// Checklists, private bytes and audit history are explicitly excluded here.
export const WORKSPACE_RECOVERY_COMPARE_MAX_ROWS = 5000;
function taskKey(task) {
  return JSON.stringify([
    String(task.title ?? ""), String(task.details ?? ""),
    String(task.status ?? ""), String(task.priority ?? "normal"),
    task.due_on ?? null,
  ]);
}
function itemKey(item) {
  return JSON.stringify([
    String(item.kind ?? ""), String(item.title ?? ""),
    item.kind === "note" ? String(item.note_text ?? "") : null,
    item.kind === "link" ? String(item.target_url ?? "") : null,
  ]);
}

function compareMultisets(archiveRows, currentRows, keyFn, label) {
  if (!Array.isArray(archiveRows) || !Array.isArray(currentRows) ||
      archiveRows.length > WORKSPACE_RECOVERY_COMPARE_MAX_ROWS ||
      currentRows.length > WORKSPACE_RECOVERY_COMPARE_MAX_ROWS) {
    throw new Error(label + " exceeds safe comparison boundaries");
  }
  const counts = new Map();
  for (const row of archiveRows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let exact = 0, currentOnly = 0;
  for (const row of currentRows) {
    const key = keyFn(row);
    const remain = counts.get(key) ?? 0;
    if (remain) {
      exact++;
      counts.set(key, remain - 1);
    } else currentOnly++;
  }
  const archiveOnly = [...counts.values()].reduce((total,n)=>total+n,0);
  return {
    archiveTotal: archiveRows.length, currentTotal: currentRows.length,
    exact, archiveOnly, currentOnly,
  };
}

export function compareWorkspaceRecoveryRecords(archive, currentTasks, currentItems) {
  if (!archive || !Array.isArray(archive.tasks) || !Array.isArray(archive.items)) {
    throw new Error("A verified recovery source is required");
  }
  return {
    tasks: compareMultisets(archive.tasks,currentTasks,taskKey,"Task records"),
    items: compareMultisets(archive.items,currentItems,itemKey,"Saved notes and links"),
    limitations: "Read-only exact multiset comparison of current task fields and note/link text only. Duplicate names are not joined by identity; checklist steps, historical revisions and private file bytes are not compared. This is not an automatic merge.",
  };
}

// Current records must be retrieved with owner/project RLS restrictions.
// Always reject truncated pages instead of presenting false perfect matches.
export async function fetchWorkspaceRecoveryComparison(client, owner, projectId, pageSize = 200) {
  if (!client || typeof owner !== "string" || !owner ||
    typeof projectId !== "string" || !projectId ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("Recovery comparison needs an authenticated owner and project");
  }
  const read = async (table, fields) => {
    const all=[];
    const seenIds=new Set();
    let expectedTotal=null;
    for(let start=0;start<=WORKSPACE_RECOVERY_COMPARE_MAX_ROWS;start+=pageSize) {
      const { data, error, count } = await client.from(table)
        .select("id,"+fields,{count:"exact"})
        .eq("owner_id",owner).eq("project_id",projectId)
        .order("id",{ ascending:true }).range(start,start+pageSize-1);
      if(error) throw new Error("Recovery comparison failed to read all " + table + ": " + error.message);
      if(!Array.isArray(data) || !Number.isSafeInteger(count) || count<0)
        throw new Error("Recovery comparison could not verify exact server row totals");
      if(count>WORKSPACE_RECOVERY_COMPARE_MAX_ROWS)
        throw new Error("Recovery project exceeds safe comparison limits");
      if(expectedTotal===null) expectedTotal=count;
      else if(expectedTotal!==count)
        throw new Error("Recovery project changed while reading; inspect again before comparing");
      if(start+data.length>count || data.length>pageSize)
        throw new Error("Recovery comparison returned unexpected page boundaries");
      for(const row of data) {
        if(!row || typeof row.id!=="string" || !row.id || seenIds.has(row.id))
          throw new Error("Recovery comparison found repeated or invalid record identities");
        seenIds.add(row.id);
        const {id,...portable}=row;
        all.push(portable); // Never emit database identity in the comparison.
      }
      if(start+data.length===count) return all;
      if(data.length<pageSize)
        throw new Error("Recovery comparison page was truncated; retry without modifying project");
    }
    throw new Error("Recovery comparison may be truncated");
  };
  const [tasks,items] = await Promise.all([
    read("workspace_tasks","title,details,status,priority,due_on"),
    read("workspace_items","kind,title,note_text,target_url"),
  ]);
  return {tasks,items};
}
