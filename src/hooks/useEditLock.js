import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase";

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;
const ACTIVITY_SYNC_INTERVAL_MS = 10 * 1000;

const EMPTY_LOCK = {
  id: 1,
  is_locked: false,
  locked_by: null,
  locked_at: null,
};

function createEditorId() {
  const savedId = sessionStorage.getItem(
    "cashbook_editor_id"
  );

  if (savedId) {
    return savedId;
  }

  const newId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

  sessionStorage.setItem(
    "cashbook_editor_id",
    newId
  );

  return newId;
}

function isLockExpired(currentLock) {
  if (!currentLock?.is_locked) {
    return false;
  }

  if (!currentLock.locked_at) {
    return true;
  }

  const lastActivityTime = new Date(
    currentLock.locked_at
  ).getTime();

  if (!Number.isFinite(lastActivityTime)) {
    return true;
  }

  return (
    Date.now() - lastActivityTime >
    INACTIVITY_TIMEOUT_MS
  );
}

export default function useEditLock() {
  const editorId = useRef(createEditorId());

  const [editing, setEditing] = useState(false);
const [lock, setLock] = useState(EMPTY_LOCK);
const [lockMessage, setLockMessage] =
  useState("");
const [autoUnlockVersion, setAutoUnlockVersion] =
  useState(0);

  const editingRef = useRef(false);
  const lockRef = useRef(EMPTY_LOCK);
  const inactivityTimerRef = useRef(null);
  const lastActivitySyncRef = useRef(0);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(
        inactivityTimerRef.current
      );

      inactivityTimerRef.current = null;
    }
  }, []);

  const releaseExpiredLock = useCallback(
    async (currentLock) => {
      if (!isLockExpired(currentLock)) {
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
        .select(
          "id,is_locked,locked_by,locked_at"
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data || EMPTY_LOCK;
    },
    []
  );

  const loadLock = useCallback(async () => {
    const { data, error } = await supabase
      .from("edit_lock")
      .select(
        "id,is_locked,locked_by,locked_at"
      )
      .eq("id", 1)
      .single();

    if (error) {
      setLockMessage(
        `Unable to load edit lock: ${error.message}`
      );

      return null;
    }

    try {
      const checkedLock =
        await releaseExpiredLock(data);

      setLock(checkedLock);

      const ownedByThisEditor =
        checkedLock.is_locked &&
        checkedLock.locked_by === editorId.current;

      setEditing(ownedByThisEditor);

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

    const { data: currentLock, error: readError } =
      await supabase
        .from("edit_lock")
        .select(
          "id,is_locked,locked_by,locked_at"
        )
        .eq("id", 1)
        .single();

    if (readError) {
      setLockMessage(
        `Unable to start editing: ${readError.message}`
      );

      return false;
    }

    let availableLock = currentLock;

    if (isLockExpired(currentLock)) {
      try {
        availableLock =
          await releaseExpiredLock(currentLock);
      } catch (releaseError) {
        setLockMessage(
          `Unable to release expired lock: ${releaseError.message}`
        );

        return false;
      }
    }

    if (
      availableLock.is_locked &&
      availableLock.locked_by !==
        editorId.current
    ) {
      setLock(availableLock);
      setEditing(false);
      setLockMessage("Editing, Please Wait!");

      return false;
    }

    if (
      availableLock.is_locked &&
      availableLock.locked_by ===
        editorId.current
    ) {
      setLock(availableLock);
      setEditing(true);
      setLockMessage("Edit mode enabled.");

      return true;
    }

    const startedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("edit_lock")
      .update({
        is_locked: true,
        locked_by: editorId.current,
        locked_at: startedAt,
      })
      .eq("id", 1)
      .eq("is_locked", false)
      .select(
        "id,is_locked,locked_by,locked_at"
      );

    if (error) {
      setLockMessage(
        `Unable to start editing: ${error.message}`
      );

      return false;
    }

    if (!data || data.length === 0) {
      await loadLock();
      setLockMessage("Editing, Please Wait!");

      return false;
    }

    lastActivitySyncRef.current = Date.now();

    setLock(data[0]);
    setEditing(true);
    setLockMessage("Edit mode enabled.(এডিট মোড চালু হয়েছে।)");

    return true;
  }, [loadLock, releaseExpiredLock]);

  const releaseLock = useCallback(async () => {
    clearInactivityTimer();

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
      setLockMessage(
        `Unable to release edit lock: ${error.message}`
      );

      return false;
    }

    setLock(EMPTY_LOCK);
    setEditing(false);
    setLockMessage("");

    return true;
  }, [clearInactivityTimer]);

  const autoUnlock = useCallback(async () => {
    const currentLock = lockRef.current;

    if (!editingRef.current) {
      return;
    }

    if (
      currentLock.locked_by !== editorId.current
    ) {
      return;
    }

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
      setLockMessage(
        `Auto unlock failed: ${error.message}`
      );

      return;
    }

    clearInactivityTimer();

    setLock(EMPTY_LOCK);
    setEditing(false);

    setLockMessage(
      "Edit session closed after 3 minutes of inactivity."
    );
    setAutoUnlockVersion((current) => current + 1);
  }, [clearInactivityTimer]);

  const markActivity = useCallback(() => {
    const currentLock = lockRef.current;

    if (!editingRef.current) {
      return;
    }

    if (
      currentLock.locked_by !== editorId.current
    ) {
      return;
    }

    clearInactivityTimer();

    inactivityTimerRef.current =
      window.setTimeout(() => {
        autoUnlock();
      }, INACTIVITY_TIMEOUT_MS);

    const now = Date.now();

    if (
      now - lastActivitySyncRef.current <
      ACTIVITY_SYNC_INTERVAL_MS
    ) {
      return;
    }

    lastActivitySyncRef.current = now;

    const activeTime = new Date().toISOString();

    supabase
      .from("edit_lock")
      .update({
        locked_at: activeTime,
      })
      .eq("id", 1)
      .eq("is_locked", true)
      .eq("locked_by", editorId.current)
      .then(({ error }) => {
        if (error) {
          console.error(
            "Unable to update edit activity:",
            error.message
          );

          return;
        }

        setLock((currentLockValue) => ({
          ...currentLockValue,
          locked_at: activeTime,
        }));
      });
  }, [autoUnlock, clearInactivityTimer]);
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

          if (!ownedByThisEditor) {
            clearInactivityTimer();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLock, clearInactivityTimer]);

  useEffect(() => {
    if (!editing) {
      clearInactivityTimer();
      return undefined;
    }

    if (lock.locked_by !== editorId.current) {
      clearInactivityTimer();
      return undefined;
    }

    markActivity();

    return () => {
      clearInactivityTimer();
    };
  }, [
    editing,
    lock.locked_by,
    markActivity,
    clearInactivityTimer,
  ]);

  useEffect(() => {
  function releaseLockOnExit() {
    const currentLock = lockRef.current;

    if (!editingRef.current) {
      return;
    }

    if (
      currentLock.locked_by !== editorId.current
    ) {
      return;
    }

    const supabaseUrl =
      import.meta.env.VITE_SUPABASE_URL;

    const supabaseAnonKey =
      import.meta.env.VITE_SUPABASE_ANON_KEY;

    fetch(
      `${supabaseUrl}/rest/v1/edit_lock?id=eq.1&locked_by=eq.${encodeURIComponent(
        editorId.current
      )}`,
      {
        method: "PATCH",

        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },

        body: JSON.stringify({
          is_locked: false,
          locked_by: null,
          locked_at: null,
        }),

        keepalive: true,
      }
    ).catch(() => {});
  }

  window.addEventListener(
    "pagehide",
    releaseLockOnExit
  );

  window.addEventListener(
    "beforeunload",
    releaseLockOnExit
  );

  return () => {
    window.removeEventListener(
      "pagehide",
      releaseLockOnExit
    );

    window.removeEventListener(
      "beforeunload",
      releaseLockOnExit
    );

    releaseLockOnExit();
  };
}, []);

  useEffect(() => {
    return () => {
      clearInactivityTimer();
    };
  }, [clearInactivityTimer]);

  const lockedByOther =
    lock.is_locked &&
    lock.locked_by !== editorId.current;

  return {
  editing,
  lock,
  lockMessage,
  lockedByOther,
  startEditing,
  releaseLock,
  loadLock,
  setLockMessage,
  markActivity,
  autoUnlockVersion,
};
}
