import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const LOCK_TIMEOUT = 3 * 60 * 1000;
const HEARTBEAT = 30000;

function createEditorId() {
  let id = sessionStorage.getItem("cashbook_editor_id");

  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString();

    sessionStorage.setItem("cashbook_editor_id", id);
  }

  return id;
}

export default function useEditLock() {
  const editorId = useRef(createEditorId());

  const [editing, setEditing] = useState(false);

  const [lock, setLock] = useState({
    is_locked: false,
    locked_by: null,
    locked_at: null,
  });

  async function loadLock() {
    const { data, error } = await supabase
      .from("edit_lock")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) return;

    if (
      data.is_locked &&
      data.locked_at &&
      Date.now() -
        new Date(data.locked_at).getTime() >
        LOCK_TIMEOUT
    ) {
      await supabase
        .from("edit_lock")
        .update({
          is_locked: false,
          locked_by: null,
          locked_at: null,
        })
        .eq("id", 1);

      setLock({
        is_locked: false,
        locked_by: null,
        locked_at: null,
      });

      return;
    }

    setLock(data);
  }

  useEffect(() => {
    loadLock();
  }, []);
