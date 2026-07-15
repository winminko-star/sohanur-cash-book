import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

import {
  calculateBalance,
  formatMoney,
  isEmptyRow,
  toNumber,
} from "../utils/calculator";

import { addRow } from "../utils/addRow";
import { fixUpRows } from "../utils/fixUp";


const DEFAULT_ROW_COUNT = 40;

function createEmptyRow(rowNumber) {
  return {
    row_no: rowNumber,
    note: "",
    blash1: "",
    blash2: "",
    return_ac: "",
    deposit: "",
    balance: "",
  };
}

function createDefaultRows() {
  return Array.from(
    { length: DEFAULT_ROW_COUNT },
    (_, index) => createEmptyRow(index + 1)
  );
}

export default function useCashBook({
  editing,
  releaseLock,
  markActivity,
}) {
  const [rows, setRows] = useState(createDefaultRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("cash_book")
      .select(
        "row_no,note,blash1,blash2,return_ac,deposit,balance"
      )
      .order("row_no", { ascending: true });

    if (error) {
      setMessage(`Unable to load data: ${error.message}`);
      return false;
    }

    const databaseRows = data || [];

    const highestRowNumber =
      databaseRows.length > 0
        ? Math.max(
            DEFAULT_ROW_COUNT,
            ...databaseRows.map((row) => row.row_no)
          )
        : DEFAULT_ROW_COUNT;

    const rowsByNumber = new Map(
      databaseRows.map((row) => [row.row_no, row])
    );

    const preparedRows = Array.from(
      { length: highestRowNumber },
      (_, index) => {
        const rowNumber = index + 1;
        const databaseRow = rowsByNumber.get(rowNumber);

        if (!databaseRow) {
          return createEmptyRow(rowNumber);
        }

        return {
          row_no: rowNumber,
          note: databaseRow.note ?? "",
          blash1: databaseRow.blash1 ?? "",
          blash2: databaseRow.blash2 ?? "",
          return_ac: databaseRow.return_ac ?? "",
          deposit: databaseRow.deposit ?? "",
          balance: calculateBalance(databaseRow),
        };
      }
    );

    setRows(preparedRows);

    return true;
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    await loadRows();
    setLoading(false);
  }, [loadRows]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const channel = supabase
      .channel("cashbook-data-realtime")
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [editing, loadRows]);
    function changeValue(rowIndex, field, value) {
    if (!editing) {
      return;
    }
      markActivity?.();

    setRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        const updatedRow = {
          ...row,
          [field]: value,
        };

        updatedRow.balance =
          calculateBalance(updatedRow);

        return updatedRow;
      })
    );
  }

  function handleAddRow() {
    if (!editing) {
      return;
    }

    setRows((currentRows) =>
      addRow(currentRows)
    );

    setMessage("New row added.");
  }

  function handleFixUp() {
    if (!editing) {
      return;
    }

    setRows((currentRows) =>
      fixUpRows(currentRows)
    );

    setMessage("Rows reorganized.");
  }

  async function handleDeleteRow() {
  if (!editing) {
    setMessage("Press EDIT first.");
    return;
  }

  if (rows.length <= DEFAULT_ROW_COUNT) {
    setMessage("The first 40 rows cannot be deleted.");
    return;
  }

  const lastRow = rows[rows.length - 1];

  if (!isEmptyRow(lastRow)) {
    setMessage("Only the last empty row can be deleted.");
    return;
  }

  const { error } = await supabase
    .from("cash_book")
    .delete()
    .eq("row_no", lastRow.row_no);

  if (error) {
    setMessage(`Delete failed: ${error.message}`);
    return;
  }

  setRows((currentRows) => currentRows.slice(0, -1));

  setMessage(`Row ${lastRow.row_no} deleted.`);
  }

  const rowCount = rows.length;

  const formattedTotals = useMemo(
    () => ({
      A: formatMoney(totals.A),
      B: formatMoney(totals.B),
      C: formatMoney(totals.C),
      D: formatMoney(totals.D),
      F: formatMoney(totals.F),
      G: formatMoney(totals.G),
      H: formatMoney(totals.H),
      I: formatMoney(totals.I),
    }),
    [totals]
  );
    async function handleUpdate() {
    if (!editing) {
      setMessage("Press EDIT first.");
      return false;
    }

    setSaving(true);
    setMessage("");

    const updatedAt = new Date().toISOString();

    const rowsToSave = rows.map((row) => ({
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
      .upsert(rowsToSave, {
        onConflict: "row_no",
      });

    if (saveError) {
      setSaving(false);
      setMessage(`Save failed: ${saveError.message}`);
      return false;
    }

    const unlocked = await releaseLock();

    if (!unlocked) {
      setSaving(false);
      setMessage(
        "Data was saved, but the edit lock could not be released."
      );
      return false;
    }

    setSaving(false);
    setMessage("Update and auto-save completed successfully.");

    await loadRows();

    return true;
  }

  return {
    rows,
    rowCount,
    loading,
    saving,
    message,
    totals,
    formattedTotals,
    loadRows,
    changeValue,
    handleAddRow,
    handleDeleteRow,
    handleFixUp,
    handleUpdate,
    setMessage,
  };
}
