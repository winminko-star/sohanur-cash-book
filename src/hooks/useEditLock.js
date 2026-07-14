import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const EMPTY_LOCK = {
  id: 1,
  is_locked: false,
  locked_by: null,
  locked_at: null,
};

function createEditorId() {
  const savedId = sessionStorage.getItem("cashbook_editor_id");

  if (savedId) {
    return savedId;
  }

  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  sessionStorage.setItem("cashbook_editor_id", newId);

  return newId;
}

function isExpired(lock) {
  if (!lock?.is_locked) {
    return false;
  }

  if (!lock.locked_at) {
    return true;
  }

  const lockedTime = new Date(lock.locked_at).getTime();

  if (!Number.isFinite(lockedTime)) {
    return true;
  }

  return Date.now() - lockedTime > LOCK_TIMEOUT_MS;
}

export default function useEditLock() {
  const editorId = useRef(createEditorId());

  const [editing, setEditing] = useState(false);
  const [lock, setLock] = useState(EMPTY_LOCK);
  const [lockMessage, setLockMessage] = useState("");

  const editingRef = useRef(false);
  const lockRef = useRef(EMPTY_LOCK);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  const releaseExpiredLock = useCallback(async (currentLock) => {
    if (!isExpired(currentLock)) {
      return currentLock;
    }

    const { data, error } = await supabase
      .from("edit_lock")
      .update({
        is_locked: false,
        locked_by: null,
        locked_at: null,
      })
      .eq("id", 1)
      .eq("locked_by", currentLock.locked_by)
      .select("id,is_locked,locked_by,locked_at")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || EMPTY_LOCK;
  }, []);

  const loadLock = useCallback(async () => {
    const { data, error } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by,locked_at")
      .eq("id", 1)
      .single();

    if (error) {
      setLockMessage(`Unable to load edit lock: ${error.message}`);
      return null;
    }

    try {
      const checkedLock = await releaseExpiredLock(data);

      setLock(checkedLock);

      if (
        checkedLock.is_locked &&
        checkedLock.locked_by === editorId.current
      ) {
        setEditing(true);
      } else {
        setEditing(false);
      }

      return checkedLock;
    } catch (releaseError) {
      setLock(data);
      setLockMessage(
        `Unable to release expired lock: ${releaseError.message}`
      );

      return data;
    }
  }, [releaseExpiredLock]);

  const startEditing = useCallback(async () => {
    setLockMessage("");

    const { data: currentLock, error: readError } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by,locked_at")
      .eq("id", 1)
      .single();

    if (readError) {
      setLockMessage(`Unable to start editing: ${readError.message}`);
      return false;
    }

    let availableLock = currentLock;

    if (isExpired(currentLock)) {
      try {
        availableLock = await releaseExpiredLock(currentLock);
      } catch (releaseError) {
        setLockMessage(
          `Unable to release expired lock: ${releaseError.message}`
        );

        return false;
      }
    }

    if (
      availableLock.is_locked &&
      availableLock.locked_by !== editorId.current
    ) {
      setLock(availableLock);
      setLockMessage("Editing, Please Wait!");

      return false;
    }

    if (
      availableLock.is_locked &&
      availableLock.locked_by === editorId.current
    ) {
      setLock(availableLock);
      setEditing(true);
      setLockMessage("Edit mode enabled.");

      return true;
    }

    const { data, error } = await supabase
      .from("edit_lock")
      .update({
        is_locked: true,
        locked_by: editorId.current,
        locked_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .eq("is_locked", false)
      .select("id,is_locked,locked_by,locked_at");

    if (error) {
      setLockMessage(`Unable to start editing: ${error.message}`);
      return false;
    }

    if (!data || data.length === 0) {
      await loadLock();
      setLockMessage("Editing, Please Wait!");

      return false;
    }

    setLock(data[0]);
    setEditing(true);
    setLockMessage("Edit mode enabled.");

    return true;
  }, [loadLock, releaseExpiredLock]);

  const releaseLock = useCallback(async () => {
    const { error } = await supabase
      .from("edit_lock")
      .update({
        is_locked: false,
        locked_by: null,
        locked_at: null,
      })
      .eq("id", 1)
      .eq("locked_by", editorId.current);

    if (error) {
      setLockMessage(`Unable to release edit lock: ${error.message}`);
      return false;
    }

    setLock(EMPTY_LOCK);
setEditing(false);
setLockMessage("");

return true;
  }, []);

  useEffect(() => {
    loadLock();

    const channel = supabase
      .channel("cashbook-edit-lock")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "edit_lock",
          filter: "id=eq.1",
        },
        (payload) => {
          const nextLock = payload.new;

          if (!nextLock) {
            return;
          }

          setLock(nextLock);

          const ownedByThisEditor =
            nextLock.is_locked &&
            nextLock.locked_by === editorId.current;

          setEditing(ownedByThisEditor);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLock]);

  useEffect(() => {
    if (!editing || lock.locked_by !== editorId.current) {
      return undefined;
    }

    const heartbeatId = window.setInterval(async () => {
      const { data, error } = await supabase
        .from("edit_lock")
        .update({
          locked_at: new Date().toISOString(),
        })
        .eq("id", 1)
        .eq("is_locked", true)
        .eq("locked_by", editorId.current)
        .select("id,is_locked,locked_by,locked_at")
        .maybeSingle();

      if (error) {
        console.error("Edit lock heartbeat failed:", error.message);
        return;
      }

      if (data) {
        setLock(data);
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [editing, lock.locked_by]);
  useEffect(() => {
  const timeoutChecker = window.setInterval(async () => {
    const { data, error } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by,locked_at")
      .eq("id", 1)
      .single();

    if (error || !data?.is_locked || !data.locked_at) {
      return;
    }

    const lockedTime = new Date(data.locked_at).getTime();
    const expired =
      Date.now() - lockedTime > LOCK_TIMEOUT_MS;

    if (!expired) {
      return;
    }

    await supabase
      .from("edit_lock")
      .update({
        is_locked: false,
        locked_by: null,
        locked_at: null,
      })
      .eq("id", 1)
      .eq("locked_by", data.locked_by);

    setLock(EMPTY_LOCK);
    setEditing(false);
    setLockMessage("Edit session expired.");
  }, 10000);

  return () => {
    window.clearInterval(timeoutChecker);
  };
}, []);

  useEffect(() => {
    function releaseLockOnExit() {
      const currentLock = lockRef.current;

      if (!editingRef.current) {
        return;
      }

      if (currentLock.locked_by !== editorId.current) {
        return;
      }

      supabase
        .from("edit_lock")
        .update({
          is_locked: false,
          locked_by: null,
          locked_at: null,
        })
        .eq("id", 1)
        .eq("locked_by", editorId.current)
        .then(() => {});
    }

    window.addEventListener("pagehide", releaseLockOnExit);
    window.addEventListener("beforeunload", releaseLockOnExit);

    return () => {
      window.removeEventListener("pagehide", releaseLockOnExit);
      window.removeEventListener("beforeunload", releaseLockOnExit);
    };
  }, []);

  const lockedByOther =
    lock.is_locked && lock.locked_by !== editorId.current;

  return {
    editing,
    lock,
    lockMessage,
    lockedByOther,
    startEditing,
    releaseLock,
    loadLock,
    setLockMessage,
  };
}
