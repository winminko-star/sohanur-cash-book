import { useEffect } from "react";
import useCashBook from "../hooks/useCashBook";
import useEditLock from "../hooks/useEditLock";
export default function DataTable() {

  const {
  editing,
  lockedByOther,
  lockMessage,
  startEditing,
  releaseLock,
  setLockMessage,
  markActivity,
  autoUnlockVersion
} = useEditLock();

  const {
  rows,
  rowCount,
  loading,
  saving,
  message,
  formattedTotals,
  loadRows,
  changeValue,
  handleAddRow,
  handleDeleteRow,
  handleDeleteRow,
  handleFixUp,
  handleUpdate,
  setMessage
} = useCashBook({
  editing,
  releaseLock,
  markActivity,
});

  const status = editing
  ? lockMessage
  : message || lockMessage;
  useEffect(() => {
  if (autoUnlockVersion === 0) {
    return;
  }

  loadRows();
}, [autoUnlockVersion, loadRows]);

  if (loading) {

    return (

      <div className="loading-card">

        Loading...

      </div>

    );

  }

  return (

    <div
  className="cashbook-panel"
  onPointerDown={markActivity}
  onKeyDown={markActivity}
  onInput={markActivity}
  onTouchStart={markActivity}
>

      <div className="action-bar">

        <button
  className="edit-button"
  disabled={editing}
  onClick={async () => {
    setMessage("");
    await startEditing();
  }}
>
  EDIT
</button>

        <button

          className="update-button"

          disabled={!editing || saving}

          onClick={handleUpdate}

        >

          {saving ? "SAVING..." : "UPDATE"}

        </button>

        <button

          className="edit-button"

          disabled={!editing}

          onClick={handleAddRow}

        >

          ADD ROW

        </button>

        <button

          className="edit-button"

          disabled={!editing}

          onClick={handleDeleteRow}

        >

          DELETE ROW

        </button>
        <button
  className="delete-all-button"
  disabled={!editing || saving}
  onClick={handleDeleteAll}
>
  {saving ? "PLEASE WAIT..." : "CLEAR ALL DATA"}
</button>

        <button

          className="edit-button"

          disabled={!editing}

          onClick={handleFixUp}

        >

          FIX UP

        </button>

      </div>

      {lockedByOther && (

        <div className="warning-message">
  Editing, Please Wait! (সম্পাদনা চলছে। অনুগ্রহ করে অপেক্ষা করুন।)
</div>

      )}

      {status && !lockedByOther && (

        <div className="status-message">

          {status}

        </div>

      )}

      <div className="table-scroll">

        <table className="cash-table">

          <thead>

            <tr>

              <th>No</th>

              <th>NOTE</th>

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

                <td className="row-number">
                  {row.row_no}
                </td>

                <td>

                  <input
                    className="note-input"
                    type="text"
                    value={row.note}
                    disabled={!editing}
                    onChange={(e)=>
                      changeValue(
                        index,
                        "note",
                        e.target.value
                      )
                    }
                  />

                </td>

                <td>

                  <input
                    className="money-input"
                    type="number"
                    value={row.blash1 || ""}
                    disabled={!editing}
                    onChange={(e)=>
                      changeValue(
                        index,
                        "blash1",
                        e.target.value
                      )
                    }
                  />

                </td>

                <td>

                  <input
                    className="money-input"
                    type="number"
                    value={row.blash2 || ""}
                    disabled={!editing}
                    onChange={(e)=>
                      changeValue(
                        index,
                        "blash2",
                        e.target.value
                      )
                    }
                  />

                </td>

                <td>

                  <input
                    className="money-input"
                    type="number"
                    value={row.return_ac || ""}
                    disabled={!editing}
                    onChange={(e)=>
                      changeValue(
                        index,
                        "return_ac",
                        e.target.value
                      )
                    }
                  />

                </td>

                <td>

                  <input
                    className="money-input"
                    type="number"
                    value={row.deposit || ""}
                    disabled={!editing}
                    onChange={(e)=>
                      changeValue(
                        index,
                        "deposit",
                        e.target.value
                      )
                    }
                  />

                </td>

                <td className="balance-cell">
  {row.balance === 0 ? "" : row.balance}
</td>

              </tr>

            ))}

          </tbody>

          <tfoot>

            <tr className="first-total-row">

              <td></td>

              <td className="total-label">
                TOTAL
              </td>

              <td>{formattedTotals.A}</td>

              <td>{formattedTotals.B}</td>

              <td>{formattedTotals.C}</td>

              <td>{formattedTotals.D}</td>

              <td></td>

            </tr>

            <tr className="second-total-row">

              <td></td>

              <td className="total-label">
                SUMMARY
              </td>

              <td>{formattedTotals.F}</td>

              <td>{formattedTotals.G}</td>

              <td>{formattedTotals.H}</td>

              <td
                colSpan="2"
                className="final-total"
              >
                {formattedTotals.I}
              </td>

            </tr>

          </tfoot>

        </table>

      </div>

      <div
        style={{
          padding: "10px 16px",
          fontWeight: 700,
          color: "#64748b"
        }}
      >
        Total Rows : {rowCount}
      </div>

    </div>

  );

          }
