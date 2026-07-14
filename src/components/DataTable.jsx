import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const EMPTY_ROWS = Array.from({ length: 40 }, (_, index) => ({
  row_no: index + 1,
  note: "",
  blash1: "",
  blash2: "",
  return_ac: "",
  deposit: "",
  balance: 0,
}));

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function displayNumber(value) {
  const number = toNumber(value);

  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function makeEditorId() {
  const savedId = sessionStorage.getItem("cashbook_editor_id");

  if (savedId) return savedId;

  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  sessionStorage.setItem("cashbook_editor_id", newId);
  return newId;
}

export default function DataTable() {
  const editorId = useRef(makeEditorId());

  const [rows, setRows] = useState(EMPTY_ROWS);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lock, setLock] = useState({
    is_locked: false,
    locked_by: null,
  });
  const [message, setMessage] = useState("");

  const totals = useMemo(() => {
    const A = rows.reduce(
      (sum, row) => sum + toNumber(row.blash1),
      0
    );

    const B = rows.reduce(
      (sum, row) => sum + toNumber(row.blash2),
      0
    );

    const C = rows.reduce(
      (sum, row) => sum + toNumber(row.return_ac),
      0
    );

    const D = rows.reduce(
      (sum, row) => sum + toNumber(row.deposit),
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
          if (!editing) {
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
          if (payload.new) {
            setLock(payload.new);

            if (
              !payload.new.is_locked &&
              payload.new.locked_by !== editorId.current
            ) {
              setEditing(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [editing]);

  async function loadInitialData() {
    setLoading(true);

    await Promise.all([loadRows(), loadLock()]);

    setLoading(false);
  }

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

    const databaseRows = new Map(
      (data || []).map((row) => [row.row_no, row])
    );

    setRows(
      EMPTY_ROWS.map((emptyRow) => ({
        ...emptyRow,
        ...databaseRows.get(emptyRow.row_no),
        note: databaseRows.get(emptyRow.row_no)?.note ?? "",
        blash1:
          databaseRows.get(emptyRow.row_no)?.blash1 ?? "",
        blash2:
          databaseRows.get(emptyRow.row_no)?.blash2 ?? "",
        return_ac:
          databaseRows.get(emptyRow.row_no)?.return_ac ?? "",
        deposit:
          databaseRows.get(emptyRow.row_no)?.deposit ?? "",
      }))
    );
  }

  async function loadLock() {
    const { data, error } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by,locked_at")
      .eq("id", 1)
      .single();

    if (error) {
      setMessage(`Unable to load edit lock: ${error.message}`);
      return;
    }

    setLock(data);
  }

  async function handleEdit() {
    setMessage("");

    const { data: latestLock, error: readError } = await supabase
      .from("edit_lock")
      .select("id,is_locked,locked_by")
      .eq("id", 1)
      .single();

    if (readError) {
      setMessage(`Unable to start editing: ${readError.message}`);
      return;
    }

    if (
      latestLock.is_locked &&
      latestLock.locked_by !== editorId.current
    ) {
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
    if (!editing) return;

    setRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowIndex) return row;

        const changedRow = {
          ...row,
          [field]: value,
        };

        changedRow.balance =
          toNumber(changedRow.blash1) +
          toNumber(changedRow.blash2) +
          toNumber(changedRow.return_ac) -
          toNumber(changedRow.deposit);

        return changedRow;
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

    const updates = rows.map((row) => ({
      row_no: row.row_no,
      note: String(row.note ?? "").trim(),
      blash1: toNumber(row.blash1),
      blash2: toNumber(row.blash2),
      return_ac: toNumber(row.return_ac),
      deposit: toNumber(row.deposit),
      balance:
        toNumber(row.blash1) +
        toNumber(row.blash2) +
        toNumber(row.return_ac) -
        toNumber(row.deposit),
      updated_at: new Date().toISOString(),
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
      is_locked: false,
      locked_by: null,
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
                  {displayNumber(
                    toNumber(row.blash1) +
                      toNumber(row.blash2) +
                      toNumber(row.return_ac) -
                      toNumber(row.deposit)
                  )}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="first-total-row">
              <td></td>
              <td className="total-label">TOTAL</td>
              <td>{displayNumber(totals.A)}</td>
              <td>{displayNumber(totals.B)}</td>
              <td>{displayNumber(totals.C)}</td>
              <td>{displayNumber(totals.D)}</td>
              <td></td>
            </tr>

            <tr className="second-total-row">
              <td></td>
              <td className="total-label">SUMMARY</td>
              <td>{displayNumber(totals.F)}</td>
              <td>{displayNumber(totals.G)}</td>
              <td>{displayNumber(totals.H)}</td>
              <td colSpan="2" className="final-total">
                {displayNumber(totals.I)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
      }
