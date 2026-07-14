import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const ROW_COUNT = 40;
const LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;

const EMPTY_ROWS = Array.from({ length: ROW_COUNT }, (_, index) => ({
  row_no: index + 1,
  note: "",
  blash1: "",
  blash2: "",
  return_ac: "",
  deposit: "",
  balance: 0,
}));

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function calculateBalance(row) {
  return (
    toNumber(row.blash1) +
    toNumber(row.blash2) +
    toNumber(row.return_ac) -
    toNumber(row.deposit)
  );
}

function createEditorId() {
  const savedEditorId = sessionStorage.getItem(
    "cashbook_editor_id"
  );

  if (savedEditorId) {
    return savedEditorId;
  }

  const newEditorId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  sessionStorage.setItem("cashbook_editor_id", newEditorId);

  return newEditorId;
}

function isLockExpired(currentLock) {
  if (!currentLock?.is_locked) {
    return false;
  }

  if (!currentLock.locked_at) {
    return true;
  }

  const lockedTime = new Date(
    currentLock.locked_at
  ).getTime();

  if (!Number.isFinite(lockedTime)) {
    return true;
  }

  return Date.now() - lockedTime > LOCK_TIMEOUT_MS;
}

export default function DataTable() {
  const editorId = useRef(createEditorId());

  const [rows, setRows] = useState(EMPTY_ROWS);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [lock, setLock] = useState({
    id: 1,
    is_locked: false,
    locked_by: null,
    locked_at: null,
  });

  const editingRef = useRef(editing);
  const lockRef = useRef(lock);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  const totals = useMemo(() => {
    const A = rows.reduce(
      (total, row) => total + toNumber(row.blash1),
      0
    );

    const B = rows.reduce(
      (total, row) => total + toNumber(row.blash2),
      0
    );

    const C = rows.reduce(
      (total, row) => total + toNumber(row.return_ac),
      0
    );

    const D = rows.reduce(
      (total, row) => total + toNumber(row.deposit),
      0
    );

    return {
      A,
      B,
      C,
      D,
      F: A,
      G: A + B,
      H: A + B + C,
      I: A + B + C - D,
    };
  }, [rows]);

  async function loadRows() {
    const { data, error } = await supabase
      .from("cash_book")
      .select(
        "row_no,note,blash1,blash2,return_ac,deposit,balance"
      )
      .order("row_no", { ascending: true });

    if (error) {
      setMessage(`Unable to load data: ${error.message}`);
      return;
    }

    const rowsByNumber = new Map(
      (data || []).map((row) => [row.row_no, row])
    );

    const preparedRows = EMPTY_ROWS.map((emptyRow) => {
      const databaseRow = rowsByNumber.get(
        emptyRow.row_no
      );

      if (!databaseRow) {
        return { ...emptyRow };
      }

      return {
        ...emptyRow,
        ...databaseRow,
        note: databaseRow.note ?? "",
        blash1: databaseRow.blash1 ?? "",
        blash2: databaseRow.blash2 ?? "",
        return_ac: databaseRow.return_ac ?? "",
        deposit: databaseRow.deposit ?? "",
        balance: calculateBalance(databaseRow),
      };
    });

    setRows(preparedRows);
  }

  async function releaseExpiredLock(currentLock) {
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
      .select("id,is_locked,locked_by,locked_at")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (
      data || {
        id: 1,
        is_locked: false,
        locked_by: null,
        locked_at: null,
      }
    );
  }

  async function loadLock() {
    const { data, error } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by,locked_at")
      .eq("id", 1)
      .single();

    if (error) {
      setMessage(
        `Unable to load edit lock: ${error.message}`
      );
      return;
    }

    try {
      const checkedLock = await releaseExpiredLock(data);
      setLock(checkedLock);
    } catch (releaseError) {
      setMessage(
        `Unable to release expired lock: ${releaseError.message}`
      );
      setLock(data);
    }
  }

  async function loadInitialData() {
    setLoading(true);

    await Promise.all([loadRows(), loadLock()]);

    setLoading(false);
  }

  useEffect(() => {
    loadInitialData();

    const channel = supabase
      .channel("cash-book-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_book",
        },
        () => {
          if (!editingRef.current) {
            loadRows();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "edit_lock",
          filter: "id=eq.1",
        },
        (payload) => {
          const newLock = payload.new;

          if (!newLock) {
            return;
          }

          setLock(newLock);

          if (
            !newLock.is_locked ||
            newLock.locked_by !== editorId.current
          ) {
            setEditing(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!editing) {
      return undefined;
    }

    if (lock.locked_by !== editorId.current) {
      return undefined;
    }

    const heartbeatId = window.setInterval(async () => {
      const currentTime = new Date().toISOString();

      const { data, error } = await supabase
        .from("edit_lock")
        .update({
          locked_at: currentTime,
        })
        .eq("id", 1)
        .eq("is_locked", true)
        .eq("locked_by", editorId.current)
        .select("id,is_locked,locked_by,locked_at")
        .maybeSingle();

      if (error) {
        console.error(
          "Edit lock heartbeat failed:",
          error.message
        );
        return;
      }

      if (data) {
        setLock(data);
      }
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [editing, lock.locked_by]);

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
    };
  }, []);
    async function handleEdit() {
    if (saving) {
      return;
    }

    setMessage("");

    const { data: latestLock, error: readError } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by,locked_at")
      .eq("id", 1)
      .single();

    if (readError) {
      setMessage(`Unable to start editing: ${readError.message}`);
      return;
    }

    if (
      latestLock.is_locked &&
      latestLock.locked_by === editorId.current
    ) {
      setLock(latestLock);
      setEditing(true);
      setMessage("Edit mode enabled.");
      return;
    }

    let availableLock = latestLock;

    if (latestLock.is_locked && isLockExpired(latestLock)) {
      try {
        availableLock = await releaseExpiredLock(latestLock);
        setLock(availableLock);
      } catch (error) {
        setMessage(
          `Unable to release expired lock: ${error.message}`
        );
        return;
      }
    }

    if (availableLock.is_locked) {
      setLock(availableLock);
      setMessage("Editing, Please Wait!");
      return;
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
      setMessage(`Unable to start editing: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      await loadLock();
      setMessage("Editing, Please Wait!");
      return;
    }

    setLock(data[0]);
    setEditing(true);
    setMessage("Edit mode enabled.");
  }

  function handleInput(rowIndex, field, value) {
    if (!editing) {
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        const updatedRow = {
          ...row,
          [field]: value,
        };

        updatedRow.balance = calculateBalance(updatedRow);

        return updatedRow;
      })
    );
  }

  async function handleUpdate() {
    if (!editing || lock.locked_by !== editorId.current) {
      setMessage("Press EDIT first.");
      return;
    }

    setSaving(true);
    setMessage("");

    const updatedAt = new Date().toISOString();

    const updates = rows.map((row) => ({
      row_no: row.row_no,
      note: String(row.note ?? "").trim(),
      blash1: toNumber(row.blash1),
      blash2: toNumber(row.blash2),
      return_ac: toNumber(row.return_ac),
      deposit: toNumber(row.deposit),
      balance: calculateBalance(row),
      updated_at: updatedAt,
    }));

    const { error: saveError } = await supabase
      .from("cash_book")
      .upsert(updates, {
        onConflict: "row_no",
      });

    if (saveError) {
      setSaving(false);
      setMessage(`Save failed: ${saveError.message}`);
      return;
    }

    const { error: unlockError } = await supabase
      .from("edit_lock")
      .update({
        is_locked: false,
        locked_by: null,
        locked_at: null,
      })
      .eq("id", 1)
      .eq("locked_by", editorId.current);

    if (unlockError) {
      setSaving(false);
      setMessage(
        `Saved, but the edit lock could not be released: ${unlockError.message}`
      );
      return;
    }

    setLock({
      id: 1,
      is_locked: false,
      locked_by: null,
      locked_at: null,
    });

    setEditing(false);
    setSaving(false);
    setMessage("Update and auto-save completed successfully.");

    await loadRows();
  }

  const lockedByOther =
    lock.is_locked && lock.locked_by !== editorId.current;

  if (loading) {
    return <div className="loading-card">Loading Cash Book...</div>;
  }

  return (
    <section className="cashbook-panel">
      <div className="action-bar">
        <div>
          <h1>Cash Book</h1>

          <p>
            {editing
              ? "Editing Mode"
              : lockedByOther
                ? "Another user is editing"
                : "View Mode"}
          </p>
        </div>

        <div className="action-buttons">
          <button
            className="edit-button"
            type="button"
            onClick={handleEdit}
            disabled={editing || saving}
          >
            EDIT
          </button>

          <button
            className="update-button"
            type="button"
            onClick={handleUpdate}
            disabled={!editing || saving}
          >
            {saving ? "SAVING..." : "UPDATE"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={
            message === "Editing, Please Wait!"
              ? "status-message warning-message"
              : "status-message"
          }
        >
          {message}
        </div>
      )}

      <div className="table-scroll">
        <table className="cash-table">
          <thead>
            <tr>
              <th className="row-number">No.</th>
              <th className="note-heading">NOTE</th>
              <th>BLASH 1</th>
              <th>BLASH 2</th>
              <th>RETURN AC</th>
              <th>DEPOSIT</th>
              <th>BALANCE</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={row.row_no}>
                <td className="row-number">{row.row_no}</td>

                <td>
                  <input
                    className="note-input"
                    type="text"
                    maxLength={80}
                    value={row.note ?? ""}
                    disabled={!editing}
                    onChange={(event) =>
                      handleInput(index, "note", event.target.value)
                    }
                  />
                </td>

                {[
                  "blash1",
                  "blash2",
                  "return_ac",
                  "deposit",
                ].map((field) => (
                  <td key={field}>
                    <input
                      className="money-input"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row[field] ?? ""}
                      disabled={!editing}
                      onChange={(event) =>
                        handleInput(index, field, event.target.value)
                      }
                    />
                  </td>
                ))}

                <td className="balance-cell">
                  {formatNumber(calculateBalance(row))}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="first-total-row">
              <td></td>
              <td className="total-label">TOTAL</td>
              <td>{formatNumber(totals.A)}</td>
              <td>{formatNumber(totals.B)}</td>
              <td>{formatNumber(totals.C)}</td>
              <td>{formatNumber(totals.D)}</td>
              <td></td>
            </tr>

            <tr className="second-total-row">
              <td></td>
              <td className="total-label">SUMMARY</td>
              <td>{formatNumber(totals.F)}</td>
              <td>{formatNumber(totals.G)}</td>
              <td>{formatNumber(totals.H)}</td>

              <td colSpan="2" className="final-total">
                {formatNumber(totals.I)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
