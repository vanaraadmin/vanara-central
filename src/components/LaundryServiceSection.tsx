import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import VanaraSectionHeader from "./vanara/VanaraSectionHeader";
import { PhoneIcon } from "./OperationsIcons";
import { useLanguage } from "../providers/language.context";
import { loadLaundryWorkspace, receiveLaundryLoad, sendLaundryLoad } from "../services/laundry.service";
import type { LaundryLoad, LaundryLoadInput, LaundryWorkspace } from "../types/laundry";

type Mode = "summary" | "send" | { receive: LaundryLoad };
type QuantityValue = number | "";
const phone = "+66970494830";
const WEIGHT_TOLERANCE_RATIO = 0.15;
const MIN_WEIGHT_TOLERANCE_KG = 0.5;

function copy(language: "en" | "th") {
  const th = language === "th";
  return {
    title: th ? "บริการซักรีดภายนอก" : "External Laundry Service", open: th ? "เปิดรายการซักรีด" : "Open laundry service", inventory: th ? "สต็อกผ้า" : "Linen inventory",
    purchased: th ? "จำนวนที่ซื้อ" : "Purchased", storage: th ? "อยู่ในสต็อก" : "In storage", out: th ? "อยู่ที่ร้านซัก" : "Out at laundry",
    send: th ? "นัดรับผ้าซักรีด" : "Request laundry pickup", sendTitle: th ? "สร้างคำขอรับผ้าซักรีด" : "Create laundry pickup request", receive: th ? "รับและตรวจผ้า" : "Receive & check load",
    kg: th ? "น้ำหนักรวม (กก.)" : "Total weight (kg)", receivedKg: th ? "น้ำหนักที่รับกลับ (กก.)" : "Returned weight (kg)", note: th ? "หมายเหตุ (ถ้ามี)" : "Note (optional)", confirmSend: th ? "ส่งคำขอรับผ้า" : "Request pickup", confirmReceive: th ? "ปิดการตรวจรับ" : "Close return check",
    cancel: th ? "ยกเลิก" : "Cancel", awaiting: th ? "รอรับผ้ากลับ" : "Awaiting return", sent: th ? "ส่งแล้ว" : "Sent", received: th ? "รับกลับแล้ว" : "Returned", discrepancy: th ? "จำนวนไม่ตรง" : "Discrepancy",
    sentQty: th ? "ส่ง" : "Sent", returnedQty: th ? "รับกลับ" : "Returned", noOpen: th ? "ไม่มีผ้าที่กำลังรอรับกลับ" : "No loads are currently awaiting return.", recent: th ? "รายการล่าสุด" : "Recent completed loads",
    call: th ? "โทรหาร้านซักรีด" : "Call laundry", confirmQuestion: th ? "ยืนยันการส่งคำขอรับผ้าไปยังร้านซักรีดหรือไม่?" : "Send this pickup request to the external laundry?", mismatch: th ? "จำนวนที่รับกลับไม่ตรงกับที่ส่ง" : "Returned quantities differ from the dispatch.", dispatchBy: th ? "ส่งโดย" : "Sent by", receivedBy: th ? "รับโดย" : "Received by",
    discrepancyDetails: th ? "รายละเอียดรายการที่ไม่ตรง" : "Discrepancy details", weightDifference: th ? "น้ำหนัก" : "Weight", missing: th ? "ขาด" : "missing", extra: th ? "เกิน" : "extra", returnCheckWarning: th ? "ตรวจพบจำนวนที่ไม่ตรง โปรดตรวจสอบก่อนปิดรายการ" : "Differences detected — check before closing this return.",
  };
}
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function dateTime(value: string, language: "en" | "th") { return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }
function quantityState(items: LaundryWorkspace["inventory"], fallback?: LaundryLoad): Record<string, QuantityValue> { return Object.fromEntries(items.map((item) => [item.sku, fallback ? (fallback.items.find((loadItem) => loadItem.sku === item.sku)?.sentQuantity ?? 0) : ""])); }

function Actor({ name, photoUrl }: { name: string; photoUrl: string | null }) { return <span className="laundry-actor" title={name}>{photoUrl ? <img src={photoUrl} alt="" /> : initials(name)}</span>; }

function signedDifference(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
function allowedWeightVariance(sentKg: number) { return Math.max(MIN_WEIGHT_TOLERANCE_KG, Math.round(sentKg * WEIGHT_TOLERANCE_RATIO * 100) / 100); }
function weightHasDiscrepancy(sentKg: number, receivedKg: number) { return Math.abs(receivedKg - sentKg) > allowedWeightVariance(sentKg); }

function DiscrepancyDetails({ load }: { load: LaundryLoad }) {
  const { language } = useLanguage(); const text = copy(language);
  const kgDifference = load.receivedKg === null || !weightHasDiscrepancy(load.sentKg, load.receivedKg) ? 0 : Math.round((load.receivedKg - load.sentKg) * 100) / 100;
  const itemDifferences = load.items.filter((item) => item.difference !== null && item.difference !== 0);
  if (kgDifference === 0 && itemDifferences.length === 0) return null;
  return <div className="laundry-load-card__discrepancy" role="alert"><div className="laundry-load-card__discrepancy-head"><strong>{text.discrepancyDetails}</strong><a aria-label={text.call} className="laundry-load-card__call" href={`tel:${phone}`} title={text.call}><PhoneIcon /></a></div>{kgDifference !== 0 && <span>{text.weightDifference}: {load.sentKg} kg {text.sentQty.toLowerCase()} · {load.receivedKg} kg {text.returnedQty.toLowerCase()} ({signedDifference(kgDifference)} kg · ±{allowedWeightVariance(load.sentKg)} kg)</span>}{itemDifferences.map((item) => {
    const difference = item.difference!;
    const itemName = language === "th" ? item.nameTh : item.nameEn;
    return <span key={item.sku}>{itemName}: {item.sentQuantity} {text.sentQty.toLowerCase()} · {item.receivedQuantity} {text.returnedQty.toLowerCase()} · {difference < 0 ? `${Math.abs(difference)} ${text.missing}` : `${difference} ${text.extra}`}</span>;
  })}</div>;
}

function ReturnDifferencePreview({ load, totalKg, quantities }: { load: LaundryLoad; totalKg: string; quantities: Record<string, QuantityValue> }) {
  const { language } = useLanguage(); const text = copy(language);
  const returnedKg = Number(totalKg);
  const kgDifference = Number.isFinite(returnedKg) && weightHasDiscrepancy(load.sentKg, returnedKg) ? Math.round((returnedKg - load.sentKg) * 100) / 100 : 0;
  const itemDifferences = load.items.map((item) => ({ item, received: typeof quantities[item.sku] === "number" ? quantities[item.sku] as number : 0 })).filter(({ item, received }) => received !== item.sentQuantity);
  if (kgDifference === 0 && itemDifferences.length === 0) return null;
  return <div className="laundry-service__warning" role="status"><strong>{text.returnCheckWarning}</strong>{kgDifference !== 0 && <span>{text.weightDifference}: {load.sentKg} kg {text.sentQty.toLowerCase()} · {Number.isFinite(returnedKg) ? returnedKg : 0} kg {text.returnedQty.toLowerCase()} ({signedDifference(kgDifference)} kg · ±{allowedWeightVariance(load.sentKg)} kg)</span>}{itemDifferences.map(({ item, received }) => {
    const difference = received - item.sentQuantity;
    const itemName = language === "th" ? item.nameTh : item.nameEn;
    return <span key={item.sku}>{itemName}: {item.sentQuantity} {text.sentQty.toLowerCase()} · {received} {text.returnedQty.toLowerCase()} · {difference < 0 ? `${Math.abs(difference)} ${text.missing}` : `${difference} ${text.extra}`}</span>;
  })}</div>;
}

function QuantityRows({ inventory, quantities, onChange, received }: { inventory: LaundryWorkspace["inventory"]; quantities: Record<string, QuantityValue>; onChange: (sku: string, quantity: QuantityValue) => void; received?: LaundryLoad | null }) {
  const { language } = useLanguage(); const text = copy(language);
  return <div className="laundry-quantity-list">{inventory.map((item) => { const sent = received?.items.find((entry) => entry.sku === item.sku)?.sentQuantity; return <label className="laundry-quantity-row" key={item.sku}><span><strong>{language === "th" ? item.nameTh : item.nameEn}</strong>{sent === undefined ? <small>{text.storage}: {item.inStorage}</small> : <small>{text.sentQty}: {sent}</small>}</span><input aria-label={language === "th" ? item.nameTh : item.nameEn} min="0" max={sent === undefined ? item.inStorage : undefined} onChange={(event) => { const raw = event.target.value; onChange(item.sku, raw === "" ? "" : Math.max(0, Number.parseInt(raw, 10) || 0)); }} placeholder="0" type="number" value={quantities[item.sku] ?? ""} /></label>; })}</div>;
}

function LoadCard({ load, onReceive }: { load: LaundryLoad; onReceive: () => void }) { const { language } = useLanguage(); const text = copy(language); return <article className={`laundry-load-card ${load.discrepancy ? "is-discrepancy" : ""}`}><div className="laundry-load-card__top"><div><strong>{load.code}</strong><span>{load.status === "SENT" ? text.awaiting : load.discrepancy ? text.discrepancy : text.received}</span></div></div><p>{text.sent}: {dateTime(load.sentAt, language)} · {load.sentKg} kg</p><div className="laundry-load-card__actors"><div><Actor name={load.sentBy.name} photoUrl={load.sentBy.profilePhotoUrl} /><span><small>{text.dispatchBy}</small>{load.sentBy.name}</span></div>{load.receivedBy && <div><Actor name={load.receivedBy.name} photoUrl={load.receivedBy.profilePhotoUrl} /><span><small>{text.receivedBy}</small>{load.receivedBy.name}</span></div>}</div>{load.status === "SENT" ? <button className="vc-primary-action laundry-load-card__action" onClick={onReceive} type="button">{text.receive}</button> : <>{load.receivedAt && <p>{text.received}: {dateTime(load.receivedAt, language)} · {load.receivedKg} kg</p>}{load.discrepancy && <DiscrepancyDetails load={load} />}</>}</article>; }

export default function LaundryServiceSection() {
  const { language } = useLanguage(); const text = copy(language); const client = useQueryClient(); const [mode, setMode] = useState<Mode>("summary"); const [kg, setKg] = useState(""); const [note, setNote] = useState("");
  const laundry = useQuery({ queryKey: ["laundry-service"], queryFn: ({ signal }) => loadLaundryWorkspace(signal), refetchInterval: 60_000 });
  const [quantities, setQuantities] = useState<Record<string, QuantityValue>>({});
  const mutate = useMutation({ mutationFn: ({ type, load, input }: { type: "send" | "receive"; load?: LaundryLoad; input: LaundryLoadInput }) => type === "send" ? sendLaundryLoad(input) : receiveLaundryLoad(load!.id, input), onSuccess: async (data) => { client.setQueryData(["laundry-service"], data); setMode("summary"); setKg(""); setNote(""); setQuantities({}); await client.invalidateQueries({ queryKey: ["laundry-service"] }); } });
  const workspace = laundry.data; const setQuantity = (sku: string, quantity: QuantityValue) => setQuantities((previous) => ({ ...previous, [sku]: quantity }));
  useEffect(() => {
    document.documentElement.classList.toggle("vc-laundry-entry-form-active", mode !== "summary");
    return () => document.documentElement.classList.remove("vc-laundry-entry-form-active");
  }, [mode]);
  const input = useMemo(() => ({ totalKg: Number(kg), quantities: Object.entries(quantities).map(([sku, quantity]) => ({ sku, quantity: typeof quantity === "number" ? quantity : 0 })).filter((item) => item.quantity > 0), note }), [kg, quantities, note]);
  const openReceive = (load: LaundryLoad) => { if (!workspace) return; setQuantities(quantityState(workspace.inventory, load)); setKg(load.sentKg.toString()); setNote(""); setMode({ receive: load }); };
  const submit = () => { if (!Number.isFinite(input.totalKg) || input.totalKg <= 0 || input.quantities.length === 0) return; if (mode === "send" && !window.confirm(text.confirmQuestion)) return; mutate.mutate({ type: mode === "send" ? "send" : "receive", load: typeof mode === "object" ? mode.receive : undefined, input }); };
  return <section className="housekeeping-v2-section laundry-service" aria-labelledby="laundry-service-title"><VanaraSectionHeader eyebrow={text.title} headingId="laundry-service-title" meta={workspace ? `${workspace.openLoads.length} ${text.awaiting.toLowerCase()}` : ""} title={text.title} />
    <div className="laundry-service__entry vc-glass-surface">{laundry.isLoading ? <p>…</p> : laundry.isError || !workspace ? <p>{language === "th" ? "ไม่สามารถเปิดข้อมูลซักรีดได้" : "Laundry service is temporarily unavailable."}</p> : mode === "summary" ? <><div className="laundry-service__actions"><button className="vc-primary-action" onClick={() => { setKg(""); setNote(""); setQuantities(quantityState(workspace.inventory)); setMode("send"); }} type="button">{text.send}</button><a className="vc-secondary-action" href={`tel:${phone}`}>{text.call}</a></div><div className="laundry-service__loads"><h3>{text.awaiting}</h3>{workspace.openLoads.length ? workspace.openLoads.map((load) => <LoadCard key={load.id} load={load} onReceive={() => openReceive(load)} />) : <p className="laundry-service__empty">{text.noOpen}</p>}</div><div className="laundry-inventory"><h3>{text.inventory}</h3><div className="laundry-inventory__head"><span></span><span>{text.purchased}</span><span>{text.storage}</span><span>{text.out}</span></div>{workspace.inventory.map((item) => <div className="laundry-inventory__row" key={item.sku}><strong>{language === "th" ? item.nameTh : item.nameEn}</strong><span>{item.purchasedTotal}</span><span>{item.inStorage}</span><span>{item.outAtLaundry}</span></div>)}</div>{workspace.recentLoads.length > 0 && <div className="laundry-service__loads"><h3>{text.recent}</h3>{workspace.recentLoads.slice(0, 6).map((load) => <LoadCard key={load.id} load={load} onReceive={() => undefined} />)}</div>}</> : <><div className="laundry-service__form-head"><button className="laundry-service__back" onClick={() => setMode("summary")} type="button">← {text.cancel}</button><h3>{mode === "send" ? text.sendTitle : `${text.receive} · ${mode.receive.code}`}</h3></div><label className="laundry-field"><span>{mode === "send" ? text.kg : text.receivedKg}</span><input inputMode="decimal" min="0" onChange={(event) => setKg(event.target.value)} placeholder="0" type="number" value={kg} /></label><QuantityRows inventory={workspace.inventory} quantities={quantities} onChange={setQuantity} received={typeof mode === "object" ? mode.receive : null} />{typeof mode === "object" && <ReturnDifferencePreview load={mode.receive} quantities={quantities} totalKg={kg} />}<label className="laundry-field"><span>{text.note}</span><textarea maxLength={600} onChange={(event) => setNote(event.target.value)} value={note} /></label>{mutate.isError && <p className="laundry-service__error">{mutate.error instanceof Error ? mutate.error.message : "Unable to save."}</p>}<button className="vc-primary-action laundry-service__submit" disabled={mutate.isPending || !Number.isFinite(input.totalKg) || input.totalKg <= 0 || input.quantities.length === 0} onClick={submit} type="button">{mutate.isPending ? "…" : mode === "send" ? text.confirmSend : text.confirmReceive}</button></>}</div></section>;
}
