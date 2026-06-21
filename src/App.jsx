import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ── 定数 ────────────────────────────────────────────────
const WORK_TYPES = [
  "型枠組立","鉄筋組立","コンクリート打設","解体作業",
  "仮設工事","土工事","資材運搬","清掃・片付け","その他"
];
const SITES = ["第1工区","第2工区","管理棟","外構"];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const fmtTime = s => s ? s.slice(0,5) : "--:--";
const calcH = (inn,out,brk=60) => {
  if(!inn||!out) return null;
  const [ih,im]=inn.split(":").map(Number);
  const [oh,om]=out.split(":").map(Number);
  const t=(oh*60+om)-(ih*60+im)-brk;
  return t>0?(t/60).toFixed(1):null;
};
const jpDate = s => new Date(s).toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"});

// ── カラー ───────────────────────────────────────────────
const C={
  bg:"#1A1F2E",surface:"#232A3B",card:"#2B3347",border:"#3A4460",
  accent:"#E8A838",accentLight:"#F5C96A",green:"#3DD68C",red:"#F26464",
  blue:"#5B9CF6",purple:"#A78BFA",text:"#E8ECF4",muted:"#8A94AE",inputBg:"#1A1F2E",
};
const bInp={background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"7px 10px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

// ── PDF生成（ブラウザ印刷） ───────────────────────────────
const printPDF = (entries, machines, dateFrom, dateTo, mode) => {
  const range = entries.filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo);
  const byDate = {};
  range.forEach(e => { if(!byDate[e.entry_date]) byDate[e.entry_date]=[]; byDate[e.entry_date].push(e); });
  const dates = Object.keys(byDate).sort();

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>労務日報</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:11px;color:#111;background:#fff;}
    h1{font-size:16px;text-align:center;margin-bottom:4px;}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:12px;}
    .page-break{page-break-after:always;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}
    th{background:#1A1F2E;color:#fff;padding:5px 7px;font-size:10px;text-align:left;}
    td{padding:5px 7px;border-bottom:1px solid #ddd;vertical-align:top;}
    tr:nth-child(even){background:#f9f9f9;}
    .badge{display:inline-block;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:700;}
    .done{background:#d1fae5;color:#065f46;}
    .not{background:#f3f4f6;color:#6b7280;}
    .section{font-size:13px;font-weight:700;margin:12px 0 4px;border-left:3px solid #E8A838;padding-left:8px;}
    .summary{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
    .scard{border:1px solid #ddd;border-radius:6px;padding:8px 12px;flex:1;min-width:100px;}
    .snum{font-size:20px;font-weight:800;line-height:1;}
    .slabel{font-size:9px;color:#666;margin-top:2px;}
    .machines{font-size:9px;color:#3b5bdb;}
    @media print{@page{size:A4;margin:15mm 12mm;}}
  </style></head><body>`;

  if(mode==="summary") {
    const allDone = range.filter(e=>e.status==="記入済").length;
    const totalH = range.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
    const usedMids=[...new Set(range.flatMap(e=>e.machine_ids||[]))];
    html+=`<h1>労務日報　複数日集計</h1>
    <div class="sub">${jpDate(dateFrom)} 〜 ${jpDate(dateTo)}　（${dates.length}日間）</div>
    <div class="summary">
      <div class="scard"><div class="snum">${dates.length}</div><div class="slabel">集計日数</div></div>
      <div class="scard"><div class="snum">${range.length}</div><div class="slabel">延べ作業員数</div></div>
      <div class="scard"><div class="snum">${allDone}</div><div class="slabel">記入済</div></div>
      <div class="scard"><div class="snum">${totalH.toFixed(1)}h</div><div class="slabel">合計労働時間</div></div>
      <div class="scard"><div class="snum">${usedMids.length}</div><div class="slabel">使用機械種別</div></div>
    </div>
    <div class="section">日別サマリー</div>
    <table><thead><tr><th>日付</th><th>作業員数</th><th>記入済</th><th>合計時間</th><th>稼働機械</th></tr></thead><tbody>`;
    dates.forEach(d=>{
      const es=byDate[d];
      const dh=es.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
      const mids=[...new Set(es.flatMap(e=>e.machine_ids||[]))];
      const mnames=mids.map(id=>machines.find(m=>m.id===id)?.name||"").filter(Boolean);
      html+=`<tr><td>${jpDate(d)}</td><td>${es.length}名</td><td>${es.filter(e=>e.status==="記入済").length}名</td><td>${dh.toFixed(1)}h</td><td class="machines">${mnames.join("、")||"—"}</td></tr>`;
    });
    html+=`</tbody></table>
    <div class="section">作業員別集計</div>
    <table><thead><tr><th>氏名</th><th>出勤日数</th><th>合計時間</th><th>主な作業</th></tr></thead><tbody>`;
    const byName={};
    range.forEach(e=>{if(!byName[e.worker_name])byName[e.worker_name]=[];byName[e.worker_name].push(e);});
    Object.entries(byName).sort((a,b)=>a[0].localeCompare(b[0],'ja')).forEach(([name,es])=>{
      const th=es.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
      const wts=[...new Set(es.map(e=>e.work_type).filter(Boolean))];
      html+=`<tr><td>${name}</td><td>${es.length}日</td><td>${th.toFixed(1)}h</td><td>${wts.join("、")||"—"}</td></tr>`;
    });
    html+=`</tbody></table>`;
  } else {
    dates.forEach((d, di) => {
      const es=byDate[d];
      const dh=es.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
      const done=es.filter(e=>e.status==="記入済").length;
      html+=`<h1>労務日報</h1><div class="sub">${jpDate(d)}</div>
      <div class="summary">
        <div class="scard"><div class="snum">${es.length}</div><div class="slabel">作業員数</div></div>
        <div class="scard"><div class="snum">${done}</div><div class="slabel">記入済</div></div>
        <div class="scard"><div class="snum">${es.length-done}</div><div class="slabel">未記入</div></div>
        <div class="scard"><div class="snum">${dh.toFixed(1)}h</div><div class="slabel">合計労働時間</div></div>
      </div>
      <table><thead><tr><th>氏名</th><th>現場</th><th>出勤</th><th>退勤</th><th>労働時間</th><th>作業種別</th><th>使用機械</th><th>特記事項</th><th>状態</th></tr></thead><tbody>`;
      es.forEach(e=>{
        const h=calcH(e.check_in,e.check_out,e.break_min);
        const mnames=(e.machine_ids||[]).map(id=>machines.find(m=>m.id===id)?.name||"").filter(Boolean);
        html+=`<tr>
          <td><b>${e.worker_name}</b></td><td>${e.site}</td>
          <td>${fmtTime(e.check_in)}</td><td>${fmtTime(e.check_out)}</td>
          <td><b>${h?h+"h":"—"}</b></td>
          <td>${e.work_type||"—"}</td>
          <td class="machines">${mnames.join("、")||"—"}</td>
          <td>${e.note||"—"}</td>
          <td><span class="badge ${e.status==="記入済"?"done":"not"}">${e.status}</span></td>
        </tr>`;
      });
      html+=`</tbody></table>`;
      if(di<dates.length-1) html+=`<div class="page-break"></div>`;
    });
  }

  html+=`</body></html>`;
  const w=window.open("","_blank","width=900,height=700");
  w.document.write(html);
  w.document.close();
  w.onload=()=>{ w.focus(); w.print(); };
};

// ── メインアプリ ──────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("attendance");
  const [entries, setEntries] = useState([]);
  const [machines, setMachines] = useState([]);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [rangeFrom, setRangeFrom] = useState(todayStr());
  const [rangeTo, setRangeTo] = useState(todayStr());

  const [workerModal, setWorkerModal] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [workerNameErr, setWorkerNameErr] = useState("");
  const [machineModal, setMachineModal] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineNote, setNewMachineNote] = useState("");
  const [machineNameErr, setMachineNameErr] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMTarget, setDeleteMTarget] = useState(null);
  const [machinePickerFor, setMachinePickerFor] = useState(null);

  // ── データ取得 ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    const [{ data: entryData, error: entryErr }, { data: machineData, error: machineErr }] = await Promise.all([
      supabase.from("entries").select("*").order("entry_date", { ascending: false }),
      supabase.from("machines").select("*").order("created_at", { ascending: true }),
    ]);
    if (entryErr) setErrorMsg("データ取得エラー: " + entryErr.message);
    if (machineErr) setErrorMsg(prev => prev + " / 機械取得エラー: " + machineErr.message);
    setEntries(entryData || []);
    setMachines(machineData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── リアルタイム同期（他の人の更新も自動反映） ─────────────
  useEffect(() => {
    const channel = supabase
      .channel("realtime-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // ── entries 操作 ────────────────────────────────────────
  const update = async (id, field, val) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e)); // 楽観的更新
    const { error } = await supabase.from("entries").update({ [field]: val, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const save = async (id) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: "記入済" } : e));
    const { error } = await supabase.from("entries").update({ status: "記入済", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const toggleMachine = async (eid, mid) => {
    const entry = entries.find(e => e.id === eid);
    if (!entry) return;
    const has = (entry.machine_ids || []).includes(mid);
    const newIds = has ? entry.machine_ids.filter(m => m !== mid) : [...(entry.machine_ids||[]), mid];
    setEntries(prev => prev.map(e => e.id === eid ? { ...e, machine_ids: newIds } : e));
    const { error } = await supabase.from("entries").update({ machine_ids: newIds }).eq("id", eid);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const addWorker = async () => {
    const name = newWorkerName.trim();
    if (!name) { setWorkerNameErr("氏名を入力してください"); return; }
    if (entries.some(e => e.worker_name === name && e.entry_date === filterDate)) {
      setWorkerNameErr("同じ名前が既にいます"); return;
    }
    const newEntry = {
      worker_name: name, entry_date: filterDate, site: SITES[0],
      check_in: null, check_out: null, break_min: 60,
      work_type: "", note: "", machine_ids: [], status: "未記入",
    };
    const { data, error } = await supabase.from("entries").insert(newEntry).select().single();
    if (error) { setErrorMsg("追加エラー: " + error.message); return; }
    setEntries(prev => [data, ...prev]);
    setNewWorkerName(""); setWorkerNameErr(""); setWorkerModal(false);
  };

  const addMachine = async () => {
    const name = newMachineName.trim();
    if (!name) { setMachineNameErr("機械名を入力してください"); return; }
    if (machines.some(m => m.name === name)) { setMachineNameErr("同じ名前が既にあります"); return; }
    const { data, error } = await supabase.from("machines").insert({ name, note: newMachineNote.trim() }).select().single();
    if (error) { setMachineNameErr("追加エラー: " + error.message); return; }
    setMachines(prev => [...prev, data]);
    setNewMachineName(""); setNewMachineNote(""); setMachineNameErr(""); setMachineModal(false);
  };

  const updateMachine = async (id, field, val) => {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, [field]: val } : m));
    const { error } = await supabase.from("machines").update({ [field]: val }).eq("id", id);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const deleteMachine = async (id) => {
    const { error } = await supabase.from("machines").delete().eq("id", id);
    if (error) { setErrorMsg("削除エラー: " + error.message); return; }
    setMachines(prev => prev.filter(m => m.id !== id));
    // 各エントリの machine_ids からも除去
    const affected = entries.filter(e => (e.machine_ids||[]).includes(id));
    for (const e of affected) {
      const newIds = e.machine_ids.filter(mid => mid !== id);
      await supabase.from("entries").update({ machine_ids: newIds }).eq("id", e.id);
    }
    setEntries(prev => prev.map(e => ({ ...e, machine_ids: (e.machine_ids||[]).filter(mid => mid !== id) })));
    setDeleteMTarget(null);
  };

  const deleteEntry = async (id) => {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) { setErrorMsg("削除エラー: " + error.message); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeleteTarget(null);
  };

  // ── 集計 ────────────────────────────────────────────────
  const filtered = entries.filter(e => e.entry_date === filterDate);
  const done = filtered.filter(e => e.status === "記入済").length;
  const totalH = filtered.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
  const usedMids = [...new Set(filtered.flatMap(e => e.machine_ids||[]))];

  const summaryData = useMemo(()=>{
    const range = entries.filter(e => e.entry_date >= rangeFrom && e.entry_date <= rangeTo);
    const dates = [...new Set(range.map(e => e.entry_date))].sort();
    const byDate = {};
    range.forEach(e => { if(!byDate[e.entry_date]) byDate[e.entry_date]=[]; byDate[e.entry_date].push(e); });
    const byName = {};
    range.forEach(e => { if(!byName[e.worker_name]) byName[e.worker_name]=[]; byName[e.worker_name].push(e); });
    const totalH = range.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
    const allMids = [...new Set(range.flatMap(e => e.machine_ids||[]))];
    return { range, dates, byDate, byName, totalH, allMids };
  }, [entries, rangeFrom, rangeTo]);

  const navBtn=(active)=>({
    padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",
    fontWeight:active?700:400,fontSize:13,
    background:active?C.accent:"transparent",
    color:active?"#1A1F2E":C.muted,transition:"all 0.15s",
  });

  if (loading) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif"}}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",fontSize:14}}
      onClick={()=>setMachinePickerFor(null)}>

      {/* ヘッダー */}
      <header style={{background:C.surface,borderBottom:`3px solid ${C.accent}`,padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52,position:"sticky",top:0,zIndex:100,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:17,fontWeight:700,color:C.accent,display:"flex",alignItems:"center",gap:6}}>
          <span>🏗</span><span>労務日報</span>
        </div>
        <nav style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {[["attendance","出退勤入力"],["machines","機械管理"],["summary","複数日集計"],["report","日報一覧"]].map(([v,label])=>(
            <button key={v} style={navBtn(view===v)} onClick={()=>setView(v)}>{label}</button>
          ))}
        </nav>
      </header>

      {errorMsg && (
        <div style={{background:C.red+"22",color:C.red,padding:"8px 16px",fontSize:12,textAlign:"center"}}>
          ⚠ {errorMsg}
        </div>
      )}

      <main style={{maxWidth:980,margin:"0 auto",padding:"18px 14px"}}>

        {view!=="summary" && (
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <span style={{color:C.muted,fontSize:13}}>対象日</span>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
              style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"6px 10px",fontSize:13,outline:"none"}}/>
            <span style={{color:C.muted,fontSize:12}}>{jpDate(filterDate)}</span>
            <div style={{marginLeft:"auto",display:"flex",gap:8}}>
              {view==="attendance"&&<>
                <button onClick={()=>setMachineModal(true)}
                  style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${C.border}`,cursor:"pointer",fontWeight:600,fontSize:12,background:"transparent",color:C.blue}}>⚙ 機械追加</button>
                <button onClick={()=>setWorkerModal(true)}
                  style={{padding:"6px 12px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.accent,color:"#1A1F2E"}}>＋ 作業員追加</button>
              </>}
              {(view==="report") && (
                <button onClick={()=>printPDF(entries,machines,filterDate,filterDate,"daily")}
                  style={{padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.purple,color:"#fff",display:"flex",alignItems:"center",gap:4}}>
                  🖨 PDF出力
                </button>
              )}
            </div>
          </div>
        )}

        {(view==="attendance"||view==="report"||view==="machines") && (
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {[
              {label:"本日の作業員",val:filtered.length,color:C.accent},
              {label:"記入済",val:done,color:C.green},
              {label:"未記入",val:filtered.length-done,color:C.red},
              {label:"合計労働時間",val:`${totalH.toFixed(1)}h`,color:C.accentLight},
              {label:"本日稼働機械",val:usedMids.length,color:C.blue},
            ].map(s=>(
              <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${s.color}`,borderRadius:8,padding:"9px 14px",flex:"1 1 100px"}}>
                <div style={{fontSize:24,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 出退勤入力 ── */}
        {view==="attendance" && (
          <>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,fontWeight:600}}>作業員別 出退勤・作業記録</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12,marginBottom:20}}>
              {filtered.map(e=>{
                const hours=calcH(e.check_in,e.check_out,e.break_min);
                const usedMs=machines.filter(m=>(e.machine_ids||[]).includes(m.id));
                const pickerOpen=machinePickerFor===e.id;
                return (
                  <div key={e.id} style={{background:C.card,border:`1px solid ${e.status==="記入済"?C.green+"66":C.border}`,borderRadius:10,padding:14,position:"relative"}}>
                    <button onClick={()=>setDeleteTarget(e.id)} style={{position:"absolute",top:9,right:9,background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:2}}>✕</button>
                    <div style={{display:"inline-block",padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:e.status==="記入済"?C.green+"22":"#3A4460",color:e.status==="記入済"?C.green:C.muted,marginBottom:7}}>{e.status}</div>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:9,paddingRight:22}}>{e.worker_name}</div>
                    <select style={{...bInp,marginBottom:7}} value={e.site} onChange={ev=>update(e.id,"site",ev.target.value)}>
                      {SITES.map(s=><option key={s}>{s}</option>)}
                    </select>
                    {[["出勤","check_in"],["退勤","check_out"]].map(([lbl,fld])=>(
                      <div key={fld} style={{display:"flex",gap:8,marginBottom:7,alignItems:"center"}}>
                        <span style={{color:C.muted,fontSize:11,width:28}}>{lbl}</span>
                        <input type="time" value={fmtTime(e[fld])==="--:--"?"":fmtTime(e[fld])} onChange={ev=>update(e.id,fld,ev.target.value||null)}
                          style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"5px 8px",fontSize:14,width:88,outline:"none"}}/>
                        {fld==="check_out"&&<div style={{marginLeft:"auto",background:hours?C.accent+"22":"transparent",color:hours?C.accent:C.muted,fontWeight:700,fontSize:12,padding:"3px 8px",borderRadius:6}}>{hours?`${hours}h`:"--"}</div>}
                      </div>
                    ))}
                    <select style={{...bInp,marginBottom:7}} value={e.work_type||""} onChange={ev=>update(e.id,"work_type",ev.target.value)}>
                      <option value="">作業種別を選択</option>
                      {WORK_TYPES.map(w=><option key={w}>{w}</option>)}
                    </select>
                    <div style={{position:"relative"}}>
                      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>使用機械</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:5,minHeight:22}}>
                        {usedMs.length===0?<span style={{fontSize:11,color:C.muted}}>なし</span>
                          :usedMs.map(m=>(
                            <span key={m.id} style={{background:C.blue+"22",color:C.blue,fontSize:11,padding:"2px 8px",borderRadius:99,display:"flex",alignItems:"center",gap:3}}>
                              {m.name}<span style={{cursor:"pointer",opacity:.7}} onClick={()=>toggleMachine(e.id,m.id)}>✕</span>
                            </span>
                          ))}
                      </div>
                      <button onClick={ev=>{ev.stopPropagation();setMachinePickerFor(pickerOpen?null:e.id);}}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`1px dashed ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>
                        ⚙ 機械を選択
                      </button>
                      {pickerOpen&&(
                        <div onClick={ev=>ev.stopPropagation()}
                          style={{position:"absolute",top:"100%",left:0,zIndex:50,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:8,marginTop:4,width:"100%",boxShadow:"0 8px 24px #0006",maxHeight:170,overflowY:"auto"}}>
                          {machines.length===0?<div style={{color:C.muted,fontSize:12,padding:8}}>機械が登録されていません</div>
                            :machines.map(m=>{
                              const chk=(e.machine_ids||[]).includes(m.id);
                              return(
                                <div key={m.id} onClick={()=>toggleMachine(e.id,m.id)}
                                  style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,cursor:"pointer",background:chk?C.blue+"18":"transparent"}}>
                                  <div style={{width:15,height:15,borderRadius:4,border:`2px solid ${chk?C.blue:C.border}`,background:chk?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",flexShrink:0}}>{chk&&"✓"}</div>
                                  <span style={{fontSize:12,color:chk?C.blue:C.text}}>{m.name}</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    <textarea style={{...bInp,resize:"vertical",minHeight:46,fontFamily:"inherit",marginTop:7,marginBottom:0}}
                      placeholder="特記事項・作業内容メモ" value={e.note||""} onChange={ev=>update(e.id,"note",ev.target.value)}/>
                    <button style={{marginTop:9,width:"100%",padding:"8px 0",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:e.status==="記入済"?C.green:C.accent,color:e.status==="記入済"?"#fff":"#1A1F2E"}}
                      onClick={()=>save(e.id)}>
                      {e.status==="記入済"?"✓ 記入済":"保存する"}
                    </button>
                  </div>
                );
              })}
              <div onClick={()=>setWorkerModal(true)}
                style={{background:"transparent",border:`2px dashed ${C.border}`,borderRadius:10,padding:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",minHeight:170,color:C.muted}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontSize:26}}>＋</span><span style={{fontSize:13}}>作業員を追加</span>
              </div>
            </div>
          </>
        )}

        {/* ── 機械管理 ── */}
        {view==="machines" && (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>機械一覧</div>
              <button onClick={()=>setMachineModal(true)}
                style={{padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:C.blue,color:"#fff"}}>⚙ 機械を追加</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
              {machines.map(m=>{
                const users=filtered.filter(e=>(e.machine_ids||[]).includes(m.id)).map(e=>e.worker_name);
                return(
                  <div key={m.id} style={{background:C.card,border:`1px solid ${users.length>0?C.blue+"66":C.border}`,borderRadius:10,padding:14,position:"relative"}}>
                    <button onClick={()=>setDeleteMTarget(m.id)} style={{position:"absolute",top:9,right:9,background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:2}}>✕</button>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                      <span style={{fontSize:20}}>⚙️</span>
                      <input value={m.name} onChange={ev=>updateMachine(m.id,"name",ev.target.value)}
                        style={{fontWeight:700,fontSize:14,background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,borderRadius:0,color:C.text,padding:"2px 0",outline:"none",width:"calc(100% - 50px)"}}/>
                    </div>
                    {users.length>0?(
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,color:C.muted,marginBottom:4}}>本日の使用者</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {users.map(u=><span key={u} style={{background:C.blue+"22",color:C.blue,fontSize:11,padding:"2px 8px",borderRadius:99}}>{u}</span>)}
                        </div>
                      </div>
                    ):<div style={{fontSize:11,color:C.muted,marginBottom:8}}>本日 未使用</div>}
                    <textarea value={m.note||""} onChange={ev=>updateMachine(m.id,"note",ev.target.value)}
                      placeholder="備考メモ（点検状況・注意事項など）"
                      style={{...bInp,resize:"vertical",minHeight:56,fontFamily:"inherit"}}/>
                  </div>
                );
              })}
              <div onClick={()=>setMachineModal(true)}
                style={{background:"transparent",border:`2px dashed ${C.border}`,borderRadius:10,padding:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",minHeight:150,color:C.muted}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontSize:26}}>⚙</span><span style={{fontSize:13}}>機械を追加</span>
              </div>
            </div>
          </>
        )}

        {/* ── 複数日集計 ── */}
        {view==="summary" && (
          <>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16,marginBottom:18,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:C.muted,fontSize:13}}>集計期間</span>
              <input type="date" value={rangeFrom} onChange={e=>setRangeFrom(e.target.value)}
                style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"6px 10px",fontSize:13,outline:"none"}}/>
              <span style={{color:C.muted}}>〜</span>
              <input type="date" value={rangeTo} onChange={e=>setRangeTo(e.target.value)}
                style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"6px 10px",fontSize:13,outline:"none"}}/>
              <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                <button onClick={()=>printPDF(entries,machines,rangeFrom,rangeTo,"daily")}
                  style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.purple}`,cursor:"pointer",fontWeight:600,fontSize:12,background:"transparent",color:C.purple}}>
                  🖨 日別PDF
                </button>
                <button onClick={()=>printPDF(entries,machines,rangeFrom,rangeTo,"summary")}
                  style={{padding:"7px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.purple,color:"#fff"}}>
                  🖨 集計PDF
                </button>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
              {[
                {label:"集計日数",val:`${summaryData.dates.length}日`,color:C.accent},
                {label:"延べ作業員数",val:`${summaryData.range.length}名`,color:C.green},
                {label:"合計労働時間",val:`${summaryData.totalH.toFixed(1)}h`,color:C.accentLight},
                {label:"使用機械種別",val:`${summaryData.allMids.length}台`,color:C.blue},
              ].map(s=>(
                <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${s.color}`,borderRadius:8,padding:"10px 14px",flex:"1 1 120px"}}>
                  <div style={{fontSize:26,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,color:C.accent}}>📅 日別サマリー</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>
                    {["日付","人数","時間","稼働機械"].map(h=><th key={h} style={{background:C.surface,color:C.muted,padding:"7px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {summaryData.dates.length===0
                      ?<tr><td colSpan={4} style={{padding:20,color:C.muted,textAlign:"center"}}>この期間の記録なし</td></tr>
                      :summaryData.dates.map(d=>{
                        const es=summaryData.byDate[d];
                        const dh=es.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
                        const mids=[...new Set(es.flatMap(e=>e.machine_ids||[]))];
                        return(
                          <tr key={d} style={{cursor:"pointer"}} onClick={()=>{setFilterDate(d);setView("report");}}>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.accentLight,fontWeight:600,whiteSpace:"nowrap"}}>{new Date(d).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",weekday:"short"})}</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`}}>{es.length}名</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:700,color:C.accentLight}}>{dh.toFixed(1)}h</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.blue,fontSize:11}}>{mids.length}台</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,color:C.green}}>👷 作業員別集計</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>
                    {["氏名","出勤日数","合計時間","主な作業"].map(h=><th key={h} style={{background:C.surface,color:C.muted,padding:"7px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {Object.keys(summaryData.byName).length===0
                      ?<tr><td colSpan={4} style={{padding:20,color:C.muted,textAlign:"center"}}>この期間の記録なし</td></tr>
                      :Object.entries(summaryData.byName).map(([name,es])=>{
                        const th=es.reduce((s,e)=>{const h=calcH(e.check_in,e.check_out,e.break_min);return s+(h?parseFloat(h):0);},0);
                        const wts=[...new Set(es.map(e=>e.work_type).filter(Boolean))];
                        return(
                          <tr key={name}>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:600,whiteSpace:"nowrap"}}>{name}</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`}}>{es.length}日</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:700,color:C.accentLight}}>{th.toFixed(1)}h</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted,fontSize:11}}>{wts[0]||"—"}{wts.length>1&&` 他${wts.length-1}件`}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── 日報一覧 ── */}
        {view==="report" && (
          <>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,fontWeight:600}}>日報一覧</div>
            <div style={{background:C.card,borderRadius:10,overflow:"auto",border:`1px solid ${C.border}`}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>
                  {["氏名","現場","出勤","退勤","労働時間","作業種別","使用機械","特記事項","状態"].map(h=>(
                    <th key={h} style={{background:C.surface,color:C.muted,fontWeight:600,padding:"8px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.length===0
                    ?<tr><td colSpan={9} style={{padding:32,color:C.muted,textAlign:"center"}}>この日の記録はありません</td></tr>
                    :filtered.map(e=>{
                      const h=calcH(e.check_in,e.check_out,e.break_min);
                      const ms=machines.filter(m=>(e.machine_ids||[]).includes(m.id));
                      return(
                        <tr key={e.id} style={{background:e.status==="記入済"?C.green+"08":"transparent"}}>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:600,whiteSpace:"nowrap"}}>{e.worker_name}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`}}><span style={{background:C.accent+"22",color:C.accent,padding:"2px 6px",borderRadius:4,fontSize:11}}>{e.site}</span></td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,whiteSpace:"nowrap"}}>{fmtTime(e.check_in)}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,whiteSpace:"nowrap"}}>{fmtTime(e.check_out)}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:h?C.accentLight:C.muted,fontWeight:700,whiteSpace:"nowrap"}}>{h?`${h}h`:"--"}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:e.work_type?C.text:C.muted,whiteSpace:"nowrap"}}>{e.work_type||"—"}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,maxWidth:150}}>
                            {ms.length===0?<span style={{color:C.muted}}>—</span>
                              :<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                                {ms.map(m=><span key={m.id} style={{background:C.blue+"22",color:C.blue,fontSize:10,padding:"1px 6px",borderRadius:99,whiteSpace:"nowrap"}}>{m.name}</span>)}
                              </div>}
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted,maxWidth:150}}>
                            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.note||"—"}</div>
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`}}>
                            <span style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,background:e.status==="記入済"?C.green+"22":"#3A4460",color:e.status==="記入済"?C.green:C.muted,whiteSpace:"nowrap"}}>{e.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {filtered.length>0&&(
              <div style={{marginTop:10,textAlign:"right",color:C.muted,fontSize:11}}>
                {filtered.length}名｜記入済{done}名｜{totalH.toFixed(1)}h｜稼働機械{usedMids.length}台
              </div>
            )}
          </>
        )}
      </main>

      {/* ── 作業員追加モーダル ── */}
      {workerModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}
          onClick={e=>{if(e.target===e.currentTarget){setWorkerModal(false);setNewWorkerName("");setWorkerNameErr("");}}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:330,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>作業員を追加</div>
            <div style={{color:C.muted,fontSize:12,marginBottom:18}}>この日の記録に追加されます</div>
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>氏名</label>
            <input autoFocus type="text" placeholder="例：山田 太郎" value={newWorkerName}
              onChange={e=>{setNewWorkerName(e.target.value);setWorkerNameErr("");}}
              onKeyDown={e=>e.key==="Enter"&&addWorker()}
              style={{...bInp,marginBottom:workerNameErr?4:18}}/>
            {workerNameErr&&<div style={{color:C.red,fontSize:12,marginBottom:10}}>{workerNameErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setWorkerModal(false);setNewWorkerName("");setWorkerNameErr("");}}
                style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={addWorker}
                style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.accent,color:"#1A1F2E",cursor:"pointer",fontWeight:700,fontSize:13}}>追加する</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 機械追加モーダル ── */}
      {machineModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}
          onClick={e=>{if(e.target===e.currentTarget){setMachineModal(false);setNewMachineName("");setNewMachineNote("");setMachineNameErr("");}}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:350,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>機械を追加</div>
            <div style={{color:C.muted,fontSize:12,marginBottom:18}}>作業員カードから紐づけできるようになります</div>
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>機械名</label>
            <input autoFocus type="text" placeholder="例：バックホウ 0.45㎥" value={newMachineName}
              onChange={e=>{setNewMachineName(e.target.value);setMachineNameErr("");}}
              onKeyDown={e=>e.key==="Enter"&&addMachine()}
              style={{...bInp,marginBottom:machineNameErr?4:10}}/>
            {machineNameErr&&<div style={{color:C.red,fontSize:12,marginBottom:8}}>{machineNameErr}</div>}
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>備考メモ（任意）</label>
            <textarea value={newMachineNote} onChange={e=>setNewMachineNote(e.target.value)}
              placeholder="点検状況・注意事項など"
              style={{...bInp,resize:"vertical",minHeight:56,fontFamily:"inherit",marginBottom:18}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setMachineModal(false);setNewMachineName("");setNewMachineNote("");setMachineNameErr("");}}
                style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={addMachine}
                style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.blue,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>追加する</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 削除確認（作業員） ── */}
      {deleteTarget!==null&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:310,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>記録を削除しますか？</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:22}}>「{entries.find(e=>e.id===deleteTarget)?.worker_name}」のこの日の記録が削除されます。</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDeleteTarget(null)} style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={()=>deleteEntry(deleteTarget)} style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 削除確認（機械） ── */}
      {deleteMTarget!==null&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:310,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>機械を削除しますか？</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:22}}>「{machines.find(m=>m.id===deleteMTarget)?.name}」を削除します。紐づけも解除されます。</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDeleteMTarget(null)} style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={()=>deleteMachine(deleteMTarget)} style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
