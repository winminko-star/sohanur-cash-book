import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const LOCK_TIMEOUT = 3 * 60 * 1000;
const HEARTBEAT = 30000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return num(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function balance(r) {
  return (
    num(r.blash1) +
    num(r.blash2) +
    num(r.return_ac) -
    num(r.deposit)
  );
}

function editorId() {
  let id = sessionStorage.getItem("editor_id");

  if (!id) {
    id =
      typeof crypto !== "undefined" &&
      crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString();

    sessionStorage.setItem("editor_id", id);
  }

  return id;
}

export default function DataTable() {

  const myId = useRef(editorId());

  const [rows, setRows] = useState([]);

  const [editing, setEditing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [msg, setMsg] =
    useState("");

  const [lock, setLock] =
    useState({
      is_locked:false,
      locked_by:null,
      locked_at:null
    });

  const totals = useMemo(()=>{

    const A = rows.reduce(
      (t,r)=>t+num(r.blash1),0
    );

    const B = rows.reduce(
      (t,r)=>t+num(r.blash2),0
    );

    const C = rows.reduce(
      (t,r)=>t+num(r.return_ac),0
    );

    const D = rows.reduce(
      (t,r)=>t+num(r.deposit),0
    );

    return{

      A,

      B,

      C,

      D,

      F:A,

      G:A+B,

      H:A+B+C,

      I:A+B+C-D

    };

  },[rows]);

  async function loadRows(){

    const {data,error}=await supabase

    .from("cash_book")

    .select("*")

    .order("row_no");

    if(error){

      setMsg(error.message);

      return;

    }

    const list=(data||[]).map(r=>({

      ...r,

      balance:balance(r)

    }));

    setRows(list);

  }

  async function loadLock(){

    const {data,error}=await supabase

    .from("edit_lock")

    .select("*")

    .eq("id",1)

    .single();

    if(error){

      setMsg(error.message);

      return;

    }

    if(
      data.is_locked &&
      data.locked_at
    ){

      const t=new Date(data.locked_at).getTime();

      if(Date.now()-t>LOCK_TIMEOUT){

        await supabase

        .from("edit_lock")

        .update({

          is_locked:false,

          locked_by:null,

          locked_at:null

        })

        .eq("id",1);

        setLock({

          is_locked:false,

          locked_by:null,

          locked_at:null

        });

        return;

      }

    }

    setLock(data);

  }

  async function load(){

    setLoading(true);

    await Promise.all([

      loadRows(),

      loadLock()

    ]);

    setLoading(false);

  }

  useEffect(()=>{

    load();

  },[]);
    useEffect(() => {

    const channel = supabase

      .channel("cashbook")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_book"
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
          filter: "id=eq.1"
        },
        (payload) => {

          if (!payload.new) return;

          setLock(payload.new);

          if (
            !payload.new.is_locked ||
            payload.new.locked_by !== myId.current
          ) {

            setEditing(false);

          }

        }
      )

      .subscribe();

    return () => {

      supabase.removeChannel(channel);

    };

  }, [editing]);

  useEffect(() => {

    if (!editing) return;

    const timer = setInterval(async () => {

      await supabase

        .from("edit_lock")

        .update({

          locked_at: new Date().toISOString()

        })

        .eq("id",1)

        .eq("locked_by",myId.current);

    }, HEARTBEAT);

    return ()=>clearInterval(timer);

  },[editing]);

  async function edit(){

    setMsg("");

    const {data,error}=await supabase

      .from("edit_lock")

      .select("*")

      .eq("id",1)

      .single();

    if(error){

      setMsg(error.message);

      return;

    }

    if(

      data.is_locked &&

      data.locked_by!==myId.current

    ){

      setMsg("Editing, Please Wait!");

      return;

    }

    const {error:updateError}=await supabase

      .from("edit_lock")

      .update({

        is_locked:true,

        locked_by:myId.current,

        locked_at:new Date().toISOString()

      })

      .eq("id",1);

    if(updateError){

      setMsg(updateError.message);

      return;

    }

    setEditing(true);

    await loadLock();

  }

  function change(index,key,value){

    if(!editing) return;

    setRows(old=>old.map((r,i)=>{

      if(i!==index) return r;

      const row={

        ...r,

        [key]:value

      };

      row.balance=balance(row);

      return row;

    }));

  }

  function addRow(){

    if(!editing) return;

    const next=

      rows.length===0

      ?1

      :Math.max(...rows.map(r=>r.row_no))+1;

    setRows([

      ...rows,

      {

        row_no:next,

        note:"",

        blash1:"",

        blash2:"",

        return_ac:"",

        deposit:"",

        balance:0

      }

    ]);

  }

  function fixUp(){

    if(!editing) return;

    const filled=[];

    const empty=[];

    rows.forEach(r=>{

      const hasData=

        r.note ||

        num(r.blash1)!==0 ||

        num(r.blash2)!==0 ||

        num(r.return_ac)!==0 ||

        num(r.deposit)!==0;

      if(hasData){

        filled.push(r);

      }else{

        empty.push(r);

      }

    });

    const list=[...filled,...empty]

      .map((r,i)=>({

        ...r,

        row_no:i+1,

        balance:balance(r)

      }));

    setRows(list);

                        }
    async function update() {

    if (!editing) {

      setMsg("Press EDIT first.");

      return;

    }

    setSaving(true);

    const saveRows = rows.map(r => ({

      row_no: r.row_no,

      note: r.note,

      blash1: num(r.blash1),

      blash2: num(r.blash2),

      return_ac: num(r.return_ac),

      deposit: num(r.deposit),

      balance: balance(r),

      updated_at: new Date().toISOString()

    }));

    const { error } = await supabase

      .from("cash_book")

      .upsert(saveRows, {

        onConflict: "row_no"

      });

    if (error) {

      setSaving(false);

      setMsg(error.message);

      return;

    }

    await supabase

      .from("edit_lock")

      .update({

        is_locked: false,

        locked_by: null,

        locked_at: null

      })

      .eq("id", 1);

    setEditing(false);

    setSaving(false);

    setMsg("Saved");

    await load();

  }

  if (loading) {

    return (

      <div className="loading-card">

        Loading...

      </div>

    );

  }

  return (

    <div className="cashbook-panel">

      <div className="action-bar">

        <button
          className="edit-button"
          onClick={edit}
          disabled={editing}
        >

          EDIT

        </button>

        <button
          className="update-button"
          onClick={update}
          disabled={!editing || saving}
        >

          {saving ? "SAVING..." : "UPDATE"}

        </button>

        <button
          className="edit-button"
          onClick={addRow}
          disabled={!editing}
        >

          ADD ROW

        </button>

        <button
          className="edit-button"
          onClick={fixUp}
          disabled={!editing}
        >

          FIX UP

        </button>

      </div>

      {msg && (

        <div className="status-message">

          {msg}

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

            {rows.map((r, i) => (

              <tr key={r.row_no}>

                <td>{r.row_no}</td>

                <td>

                  <input

                    value={r.note}

                    disabled={!editing}

                    onChange={e =>
                      change(
                        i,
                        "note",
                        e.target.value
                      )
                    }

                  />

                </td>

                <td>

                  <input

                    type="number"

                    value={r.blash1}

                    disabled={!editing}

                    onChange={e =>
                      change(
                        i,
                        "blash1",
                        e.target.value
                      )
                    }

                  />

                </td>

                <td>

                  <input

                    type="number"

                    value={r.blash2}

                    disabled={!editing}

                    onChange={e =>
                      change(
                        i,
                        "blash2",
                        e.target.value
                      )
                    }

                  />

                </td>
                                <td>
                  <input
                    type="number"
                    value={r.return_ac}
                    disabled={!editing}
                    onChange={e =>
                      change(
                        i,
                        "return_ac",
                        e.target.value
                      )
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={r.deposit}
                    disabled={!editing}
                    onChange={e =>
                      change(
                        i,
                        "deposit",
                        e.target.value
                      )
                    }
                  />
                </td>

                <td className="balance-cell">
                  {money(balance(r))}
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

              <td>
                {money(totals.A)}
              </td>

              <td>
                {money(totals.B)}
              </td>

              <td>
                {money(totals.C)}
              </td>

              <td>
                {money(totals.D)}
              </td>

              <td></td>

            </tr>

            <tr className="second-total-row">

              <td></td>

              <td className="total-label">
                SUMMARY
              </td>

              <td>
                {money(totals.F)}
              </td>

              <td>
                {money(totals.G)}
              </td>

              <td>
                {money(totals.H)}
              </td>

              <td
                colSpan="2"
                className="final-total"
              >
                {money(totals.I)}
              </td>

            </tr>

          </tfoot>

        </table>

      </div>

    </div>

  );

}
